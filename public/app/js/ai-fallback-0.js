/* ════════════════════════════════════════════════════════════════
   AI FALLBACK WRAPPER
   ────────────────────────────────────────────────────────────────
   Adds OpenAI as automatic fallback for ALL /api/anthropic calls.
   Works invisibly — no other code needs to change.
   
   Behavior:
     1. Try Anthropic first (Claude)
     2. If Anthropic returns 5xx / 429 / network fail / times out → 
        retry once on /api/openai with same body
     3. OpenAI endpoint already returns Anthropic-shaped JSON, so the
        caller never knows which provider answered
   
   Logging: console shows [AI-FALLBACK] when OpenAI is used so you
   can monitor whether fallback is triggering in production.
   ════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

// Statuses that should trigger fallback (transient / overload errors)
var FALLBACK_STATUSES = new Set([429, 500, 502, 503, 504, 520, 521, 522, 524]);

// How long to wait before considering Anthropic "too slow" and trying OpenAI
var SLOW_TIMEOUT_MS = 90000; // 90 seconds — long calls (lessons) need headroom

// Save the original fetch
var _origFetch = window.fetch.bind(window);

// Only intercept calls to our own /api/anthropic endpoint
function isAnthropicCall(input) {
  var url = '';
  if (typeof input === 'string') url = input;
  else if (input && input.url) url = input.url;
  return url.indexOf('/api/anthropic') === 0 || url.endsWith('/api/anthropic');
}

// Build a fetch call to /api/openai with the same body
function callOpenAIFallback(originalInit) {
  console.warn('[AI-FALLBACK] Anthropic failed/slow → trying OpenAI');
  return _origFetch('/api/openai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: originalInit && originalInit.body ? originalInit.body : '{}',
  });
}

// Fetch with timeout — if Anthropic hangs, race against the timeout
function fetchWithTimeout(input, init, timeoutMs) {
  return new Promise(function(resolve, reject) {
    var controller;
    var signal = init && init.signal;
    
    // Don't override caller's abort signal — only add timeout
    var timer = setTimeout(function() {
      reject(new Error('TIMEOUT'));
    }, timeoutMs);
    
    _origFetch(input, init).then(function(res) {
      clearTimeout(timer);
      resolve(res);
    }).catch(function(err) {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// Replace window.fetch with our wrapped version
window.fetch = function(input, init) {
  // Pass through any non-Anthropic calls untouched
  if (!isAnthropicCall(input)) {
    return _origFetch(input, init);
  }
  
  // For Anthropic calls: try Anthropic, fall back to OpenAI on failure
  return fetchWithTimeout(input, init, SLOW_TIMEOUT_MS).then(function(res) {
    // Anthropic responded — check if status indicates we should fall back
    if (res.ok) {
      return res; // Success! Return Anthropic response
    }
    if (FALLBACK_STATUSES.has(res.status)) {
      console.warn('[AI-FALLBACK] Anthropic returned ' + res.status + ' → fallback');
      return callOpenAIFallback(init);
    }
    return res; // Non-fallback error (e.g. 400 bad request) — pass through
  }).catch(function(err) {
    // Network error or timeout — fall back
    console.warn('[AI-FALLBACK] Anthropic error: ' + (err.message || err));
    return callOpenAIFallback(init);
  });
};

console.log('[AI-FALLBACK] Active — Anthropic with OpenAI fallback');

})();
