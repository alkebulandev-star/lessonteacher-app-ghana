// Vercel Serverless Function: proxies requests to Anthropic.
// - Reads ANTHROPIC_API_KEY from Vercel env vars.
// - Retries automatically on transient failures (429, 5xx, 529 overloaded,
//   plus 520-524 Cloudflare-class errors that occasionally hit Anthropic).
// - Uses jittered exponential backoff to avoid retry stampedes when Anthropic
//   is briefly overloaded (529).
// - Returns structured JSON errors so the client can show real diagnostics.
// - PASSES THROUGH STREAMING when the client sets `stream: true` on the body —
//   this is critical for long lesson/exam generations because:
//     1) the first byte arrives within a few seconds (no idle-timeout death)
//     2) the user sees progressive output instead of staring at a spinner
//     3) total elapsed time matters less because the connection stays alive
// - maxDuration 300s uses Vercel Fluid Compute (default on all plans now) so
//   long AI generations have real headroom. Vercel bills only on active CPU
//   time, not the I/O wait, so the longer ceiling is essentially free.
export const config = { maxDuration: 300 };

// Per-attempt timeout — allows even very long generations (8000-token exam
// papers etc.) to finish on a single attempt. 120s is well within the 300s
// function ceiling, leaving room for retries.
const TIMEOUT_MS = 120_000;
const MAX_ATTEMPTS = 4;
const RETRY_STATUSES = new Set([
  408, 425, 429,
  500, 502, 503, 504,
  520, 521, 522, 523, 524,  // Cloudflare-class transient errors
  529,                       // Anthropic-specific "overloaded"
]);

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// Backoff with jitter — pure exponential causes synchronized retries from many
// clients ("retry storm"). Adding ~0–250ms of jitter spreads them out.
function backoffMs(attempt: number) {
  const base = 400 * Math.pow(2, attempt - 1); // 400, 800, 1600, 3200
  const jitter = Math.floor(Math.random() * 250);
  return base + jitter;
}

async function callAnthropic(apiKey: string, rawBody: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: rawBody,
      signal: controller.signal,
    });
    return { upstream, controller, timeoutId };
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

// Pipe an SSE/streaming response through to the client. The timeout is
// extended (cleared) once we receive headers — at that point Anthropic is
// actively sending data and we want the full stream to flow even if it takes
// minutes.
async function pipeStream(upstream: Response, res: any, timeoutId: any) {
  // Headers received — kill the per-attempt timeout, the stream itself will
  // tell us when we're done via end-of-body.
  clearTimeout(timeoutId);
  res.setHeader('content-type', upstream.headers.get('content-type') || 'text/event-stream');
  res.setHeader('cache-control', 'no-cache, no-transform');
  res.setHeader('x-accel-buffering', 'no'); // disable proxy buffering for SSE
  res.status(upstream.status);
  // Flush headers immediately so the client sees the connection is alive
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  const reader = upstream.body?.getReader();
  if (!reader) { res.end(); return; }
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      // value is a Uint8Array — write it through to the client
      res.write(Buffer.from(value));
    }
  } catch (e) {
    try { console.error('[anthropic-proxy] stream error:', e); } catch(_){}
  } finally {
    try { res.end(); } catch(_){}
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed', provider: 'anthropic' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'ANTHROPIC_API_KEY is not configured in Vercel.',
      hint: 'Project Settings → Environment Variables → add ANTHROPIC_API_KEY (Production), then redeploy.',
      provider: 'anthropic',
    });
  }

  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});

  // Detect whether the client requested streaming. We pass the body through
  // either way, but the response handling differs.
  let isStreaming = false;
  try {
    const parsed = JSON.parse(rawBody);
    isStreaming = parsed && parsed.stream === true;
  } catch(_){}

  let lastStatus = 0;
  let lastText = '';
  let lastErr: any = null;
  const attemptLog: Array<{ attempt: number; status?: number; err?: string }> = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let timeoutId: any = null;
    try {
      const { upstream, timeoutId: tid } = await callAnthropic(apiKey, rawBody);
      timeoutId = tid;
      if (upstream.ok) {
        if (isStreaming) {
          // Stream — pipe the SSE body straight through. pipeStream clears
          // the timeout once headers arrive.
          if (attempt > 1) res.setHeader('x-anthropic-attempt', String(attempt));
          await pipeStream(upstream, res, timeoutId);
          return;
        }
        // Non-streaming — read full body, return JSON. Clear the timeout
        // because we own the response now.
        clearTimeout(timeoutId);
        const text = await upstream.text();
        const contentType = upstream.headers.get('content-type') || 'application/json';
        res.setHeader('content-type', contentType);
        if (attempt > 1) res.setHeader('x-anthropic-attempt', String(attempt));
        return res.status(upstream.status).send(text);
      }
      // Upstream returned an error — read body for diagnostic, then decide
      // whether to retry.
      clearTimeout(timeoutId);
      const text = await upstream.text();
      const contentType = upstream.headers.get('content-type') || 'application/json';
      lastStatus = upstream.status;
      lastText = text;
      attemptLog.push({ attempt, status: upstream.status });
      if (!RETRY_STATUSES.has(upstream.status) || attempt === MAX_ATTEMPTS) {
        // Non-retryable, or last attempt — pass upstream error through.
        res.setHeader('content-type', contentType);
        res.setHeader('x-anthropic-attempts', String(attempt));
        return res.status(upstream.status).send(text);
      }
    } catch (err: any) {
      if (timeoutId) { try { clearTimeout(timeoutId); } catch(_){} }
      lastErr = err;
      const isAbort = err?.name === 'AbortError';
      attemptLog.push({ attempt, err: isAbort ? 'timeout' : (err?.message || String(err)) });
      if (attempt === MAX_ATTEMPTS) {
        return res.status(isAbort ? 504 : 502).json({
          error: isAbort
            ? `Anthropic timed out after ${TIMEOUT_MS / 1000}s on all ${MAX_ATTEMPTS} attempts.`
            : `Anthropic request failed: ${err?.message || String(err)}`,
          attempts: attemptLog,
          provider: 'anthropic',
        });
      }
    }
    await sleep(backoffMs(attempt));
  }

  return res.status(lastStatus || 502).json({
    error: 'Anthropic exhausted retries.',
    detail: lastText || (lastErr ? String(lastErr) : ''),
    attempts: attemptLog,
    provider: 'anthropic',
  });
}
