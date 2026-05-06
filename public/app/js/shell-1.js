// ============================================================
// PREVIEW MODE + SERVER FALLBACK
// - Lets you paste an Anthropic key in preview (stored in localStorage only).
// - In production (Vercel), keys live server-side.
// - Adds a "Server" picker:
//     server=1  → Anthropic (/api/anthropic)
//     server=2  → OpenAI    (/api/openai)
//     server=auto (default) → Try Anthropic first, auto-fall back to OpenAI on failure.
// - Auto-fallback applies in BOTH preview and production.
// ============================================================
(function(){
  var qs = new URLSearchParams(location.search);
  // Production = anything served over http(s) from a non-localhost host.
  // This makes the app work on the default *.vercel.app domain AND on any
  // custom domain you attach (yourdomain.com, lessonteacher.app, etc.).
  // Preview mode (paste-your-key bar) is now ONLY used when running locally.
  var host = (location.hostname || '').toLowerCase();
  var isLocal = host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '' || location.protocol === 'file:';
  var isPreview = isLocal;
  var onVercel = !isLocal; // kept for any downstream code that reads it

  function lsGet(k, d){ try{ return localStorage.getItem(k) || d || ''; }catch(e){ return d||''; } }
  function lsSet(k, v){ try{ localStorage.setItem(k, v||''); }catch(e){} }

  function getKey(){ return lsGet('ANTHROPIC_API_KEY',''); }
  function setKey(v){ lsSet('ANTHROPIC_API_KEY', v); }
  function getOaiKey(){ return lsGet('OPENAI_API_KEY',''); }
  function setOaiKey(v){ lsSet('OPENAI_API_KEY', v); }
  function getServer(){ return lsGet('LT_SERVER','auto'); } // auto | 1 | 2
  function setServer(v){ lsSet('LT_SERVER', v); }

  // ---------- Status pill (shown on every page) ----------
  function mountPill(){
    if (document.getElementById('lt-srv-pill')) return;
    var pill = document.createElement('div');
    pill.id = 'lt-srv-pill';
    pill.style.cssText = 'position:fixed;bottom:14px;right:14px;z-index:2147483646;background:rgba(15,23,42,.92);color:#fff;border:1px solid rgba(255,255,255,.18);padding:6px 10px;border-radius:100px;font:12px system-ui,sans-serif;cursor:pointer;display:flex;gap:6px;align-items:center;box-shadow:0 6px 20px rgba(0,0,0,.4)';
    pill.title = 'Click to change AI server';
    refreshPill(pill);
    pill.onclick = openServerMenu;
    document.body.appendChild(pill);
  }
  function refreshPill(pill){
    pill = pill || document.getElementById('lt-srv-pill');
    if (!pill) return;
    var s = getServer();
    var label = s === '1'    ? 'Lesson Teacher'
              : s === '2'    ? 'Co Lesson Teacher'
              : s === 'both' ? 'Both Teachers'
              : 'Auto Teacher';
    var dot = window._ltLastProvider === 'openai' ? '🟢'
            : window._ltLastProvider === 'anthropic' ? '🔵'
            : window._ltLastProvider === 'both' ? '🟣' : '⚪';
    pill.innerHTML = '<span>'+dot+'</span><span style="font-weight:700">'+label+'</span>';
  }

  function openServerMenu(){
    var existing = document.getElementById('lt-srv-menu');
    if (existing){ existing.remove(); return; }
    var box = document.createElement('div');
    box.id = 'lt-srv-menu';
    box.style.cssText = 'position:fixed;bottom:54px;right:14px;z-index:2147483647;background:#0f172a;color:#fff;border:1px solid rgba(255,255,255,.18);padding:14px;border-radius:14px;font:13px system-ui,sans-serif;width:280px;box-shadow:0 14px 40px rgba(0,0,0,.55)';
    box.innerHTML =
      '<div style="font-weight:800;margin-bottom:10px;font-size:14px">AI Server</div>'
      +'<label style="display:flex;gap:8px;align-items:flex-start;padding:8px;border-radius:8px;cursor:pointer" class="ltsrv"><input type="radio" name="ltsrv" value="auto"> <div><div style="font-weight:700">Auto Teacher (recommended)</div><div style="opacity:.65;font-size:11px">Tries Lesson Teacher first, switches to Co Lesson Teacher if needed.</div></div></label>'
      +'<label style="display:flex;gap:8px;align-items:flex-start;padding:8px;border-radius:8px;cursor:pointer" class="ltsrv"><input type="radio" name="ltsrv" value="1"> <div><div style="font-weight:700">Lesson Teacher (main teacher)</div><div style="opacity:.65;font-size:11px">Use the Lesson Teacher only.</div></div></label>'
      +'<label style="display:flex;gap:8px;align-items:flex-start;padding:8px;border-radius:8px;cursor:pointer" class="ltsrv"><input type="radio" name="ltsrv" value="2"> <div><div style="font-weight:700">Co Lesson Teacher</div><div style="opacity:.65;font-size:11px">Co-teacher only.</div></div></label>'
      +'<label style="display:flex;gap:8px;align-items:flex-start;padding:8px;border-radius:8px;cursor:pointer" class="ltsrv"><input type="radio" name="ltsrv" value="both"> <div><div style="font-weight:700">Both Teachers 🤝</div><div style="opacity:.65;font-size:11px">Asks both teachers and combines answers. Slower (longer loading time), richer results.</div></div></label>'
      +'<div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,.1);display:flex;gap:8px;justify-content:flex-end"><button id="ltsrv-close" style="background:#3b82f6;color:#fff;border:0;padding:7px 14px;border-radius:8px;font-weight:700;cursor:pointer">Done</button></div>';
    document.body.appendChild(box);
    var cur = getServer();
    box.querySelectorAll('input[name=ltsrv]').forEach(function(r){
      r.checked = (r.value === cur);
      r.onchange = function(){ setServer(r.value); refreshPill(); };
    });
    box.querySelector('#ltsrv-close').onclick = function(){ box.remove(); };
  }

  // ---------- Preview key bar ----------
  function mountBanner(){
    if (!isPreview) { mountPill(); return; }
    if (document.getElementById('lt-key-bar')) { mountPill(); return; }
    var bar = document.createElement('div');
    bar.id = 'lt-key-bar';
    bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#dc2626;color:#fff;font:13px/1.4 system-ui,sans-serif;padding:8px 12px;display:flex;gap:6px;align-items:center;flex-wrap:wrap;border-bottom:2px solid #fbbf24;box-shadow:0 4px 12px rgba(0,0,0,.4)';
    bar.innerHTML =
      '<span style="font-weight:700;white-space:nowrap">🔑 PREVIEW</span>'
      +'<input id="lt-key-input" type="password" placeholder="sk-ant-... (Lesson Teacher key)" style="flex:1;min-width:140px;background:#fff;border:1px solid #fbbf24;color:#000;padding:5px 8px;border-radius:4px;font:12px monospace" />'
      +'<input id="lt-oai-input" type="password" placeholder="sk-... (Co Lesson Teacher key)" style="flex:1;min-width:140px;background:#fff;border:1px solid #fbbf24;color:#000;padding:5px 8px;border-radius:4px;font:12px monospace" />'
      +'<button id="lt-key-save" style="background:#fbbf24;color:#000;border:0;padding:5px 12px;border-radius:4px;cursor:pointer;font-weight:700">Save</button>'
      +'<button id="lt-key-hide" title="Hide" style="background:transparent;color:#fff;border:0;padding:0 6px;cursor:pointer;font-size:18px">×</button>'
      +'<span id="lt-key-status" style="opacity:.95;white-space:nowrap;font-weight:600"></span>';
    (document.body || document.documentElement).appendChild(bar);
    var ai = bar.querySelector('#lt-key-input');
    var oi = bar.querySelector('#lt-oai-input');
    var st = bar.querySelector('#lt-key-status');
    ai.value = getKey(); oi.value = getOaiKey();
    if (ai.value || oi.value) st.textContent = '✓ saved';
    bar.querySelector('#lt-key-save').onclick = function(){
      setKey(ai.value.trim()); setOaiKey(oi.value.trim());
      st.textContent = '✓ saved'; setTimeout(function(){ location.reload(); }, 250);
    };
    bar.querySelector('#lt-key-hide').onclick = function(){ bar.style.display='none'; document.body.style.paddingTop=''; };
    setTimeout(function(){
      var h = bar.offsetHeight || 50;
      document.body.style.paddingTop = ((parseInt(getComputedStyle(document.body).paddingTop)||0) + h) + 'px';
    }, 50);
    mountPill();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountBanner);
  else mountBanner();

  // ---------- Fetch shim with server routing + auto-fallback ----------
  var _origFetch = window.fetch.bind(window);

  function previewDirectAnthropic(init){
    var key = getKey();
    if (!key) return Promise.resolve(new Response(JSON.stringify({error:'Preview: paste your Anthropic key in the bar at the top.'}), {status:401,headers:{'Content-Type':'application/json'}}));
    return _origFetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{ 'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true' },
      body: (init && init.body) || '{}'
    });
  }
  function previewDirectOpenAI(init){
    var key = getOaiKey();
    if (!key) return Promise.resolve(new Response(JSON.stringify({error:'Preview: paste your OpenAI key in the bar at the top to use Server 2.'}), {status:401,headers:{'Content-Type':'application/json'}}));
    // Translate Anthropic-style body → OpenAI Chat Completions, then back.
    var body = {}; try { body = JSON.parse((init && init.body) || '{}'); } catch(e){}
    var msgs = [];
    if (body.system) msgs.push({role:'system', content: String(body.system)});
    (body.messages||[]).forEach(function(m){
      var c = m.content;
      if (Array.isArray(c)){
        var parts = [];
        c.forEach(function(b){
          if (b.type==='text') parts.push({type:'text', text:b.text||''});
          else if (b.type==='image' && b.source && b.source.type==='base64') parts.push({type:'image_url', image_url:{url:'data:'+b.source.media_type+';base64,'+b.source.data}});
        });
        if (parts.length===1 && parts[0].type==='text') c = parts[0].text;
        else c = parts;
      }
      msgs.push({role:m.role, content:c});
    });
    var oaiBody = { model: /opus|sonnet/i.test(body.model||'') ? 'gpt-4o' : 'gpt-4o-mini', messages: msgs, max_tokens: Math.min(body.max_tokens||1024, 4096) };
    return _origFetch('https://api.openai.com/v1/chat/completions', {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer '+key },
      body: JSON.stringify(oaiBody)
    }).then(function(r){
      return r.text().then(function(raw){
        if (!r.ok) return new Response(JSON.stringify({error:'OpenAI error', status:r.status, detail:raw}), {status:r.status, headers:{'Content-Type':'application/json'}});
        var d = {}; try{ d = JSON.parse(raw); }catch(e){}
        var text = (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '';
        var shape = { id:d.id||'oai-'+Date.now(), type:'message', role:'assistant', model:oaiBody.model, content:[{type:'text', text:String(text)}], stop_reason:(d.choices&&d.choices[0]&&d.choices[0].finish_reason)||'end_turn', usage:{input_tokens:(d.usage&&d.usage.prompt_tokens)||0, output_tokens:(d.usage&&d.usage.completion_tokens)||0}, _provider:'openai' };
        return new Response(JSON.stringify(shape), {status:200, headers:{'Content-Type':'application/json'}});
      });
    });
  }

  function callServer(which, init){
    if (isPreview){
      return which === 'openai' ? previewDirectOpenAI(init) : previewDirectAnthropic(init);
    }
    var url = which === 'openai' ? '/api/openai' : '/api/anthropic';
    // Wrap with long-request safety net (still-working indicator + hard ceiling).
    // Production functions have maxDuration=300s; we cap the client at 270s so
    // we surface a real error if Vercel ever runs to its ceiling without
    // responding.
    return fetchWithLongRequestSafety(url, init);
  }

  // ── Long-request safety net ───────────────────────────────────────────────
  // The upstream functions (api/anthropic.ts, api/openai.ts) now allow up to
  // 300 seconds via Fluid Compute, and the per-attempt timeout is 120s with up
  // to 4 retries. That means a single client call can legitimately take a few
  // minutes for a long lesson or exam paper.
  //
  // Three problems we have to handle explicitly on the client:
  //   1) During a long wait, intermediate proxies (corporate, mobile carrier)
  //      may drop "idle" connections at 30-60s. We can't fix the network, but
  //      we CAN tell the user the request is genuinely still in flight.
  //   2) If the request truly hangs (server crash, network blackhole), fetch()
  //      has no default timeout — it would wait until the OS gives up, which
  //      could be many minutes. We add a 270s ceiling to surface a real error.
  //   3) Users need a visible signal "we're still working" so they don't tap
  //      the request again (which would create duplicate work and burn API
  //      quota).
  var STILL_WORKING_AFTER_MS = 18_000;   // show "still working" after 18s
  var HARD_CEILING_MS        = 270_000;  // 270s — just under the 300s function ceiling

  window._ltInFlight = 0;  // count of in-flight API requests

  function fetchWithLongRequestSafety(url, init){
    init = init || {};
    var ac = new AbortController();
    // If caller already provided a signal, link them together
    var callerSignal = init.signal;
    if (callerSignal) {
      if (callerSignal.aborted) ac.abort();
      else callerSignal.addEventListener('abort', function(){ ac.abort(); });
    }
    var startTs = Date.now();
    window._ltInFlight++;

    // After STILL_WORKING_AFTER_MS, show a soft toast that updates with elapsed time.
    var stillWorkingTimer = setTimeout(function(){ showStillWorkingToast(startTs, ac); }, STILL_WORKING_AFTER_MS);

    // Hard ceiling — abort the fetch after HARD_CEILING_MS so a truly stuck
    // request surfaces an error instead of hanging the UI forever.
    var ceilingTimer = setTimeout(function(){
      try { ac.abort(); } catch(e){}
    }, HARD_CEILING_MS);

    var fetchInit = Object.assign({}, init, { signal: ac.signal });

    return _origFetch(url, fetchInit).then(function(r){
      clearTimeout(stillWorkingTimer);
      clearTimeout(ceilingTimer);
      hideStillWorkingToast();
      window._ltInFlight = Math.max(0, window._ltInFlight - 1);
      return r;
    }, function(err){
      clearTimeout(stillWorkingTimer);
      clearTimeout(ceilingTimer);
      hideStillWorkingToast();
      window._ltInFlight = Math.max(0, window._ltInFlight - 1);
      // If we hit the hard ceiling, surface a clearer error
      if (err && err.name === 'AbortError' && (Date.now() - startTs) >= (HARD_CEILING_MS - 500)) {
        // Wrap in a synthetic Response so callers handle it the same as a 504
        return new Response(JSON.stringify({
          error: 'Request exceeded the ' + (HARD_CEILING_MS/1000) + 's client safety ceiling. The server may be overloaded — please try again in a moment.',
          provider: url.indexOf('openai') >= 0 ? 'openai' : 'anthropic',
          clientCeiling: true,
        }), { status: 504, headers: { 'Content-Type': 'application/json' } });
      }
      throw err;
    });
  }

  // Soft "still working" toast — shows after ~18s and updates elapsed time
  // every second. Goes away when the request resolves. The user can tap it
  // to abort the request if they've changed their mind.
  function showStillWorkingToast(startTs, abortController){
    if (document.getElementById('lt-working-toast')) return; // already shown
    var t = document.createElement('div');
    t.id = 'lt-working-toast';
    t.style.cssText = 'position:fixed;bottom:60px;left:50%;transform:translateX(-50%);z-index:2147483645;background:rgba(15,23,42,.94);color:#fff;padding:10px 16px;border-radius:100px;font:13px system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.4);display:flex;gap:10px;align-items:center;border:1px solid rgba(255,255,255,.18)';
    t.innerHTML =
        '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#fbbf24;animation:lt-pulse 1.2s ease-in-out infinite"></span>'
      + '<span>Still working… <span id="lt-working-elapsed">0</span>s</span>'
      + '<button id="lt-working-cancel" style="background:rgba(255,255,255,.12);color:#fff;border:1px solid rgba(255,255,255,.25);padding:4px 10px;border-radius:100px;font-size:11px;font-weight:700;cursor:pointer">Cancel</button>';
    document.body.appendChild(t);
    // Inject pulse keyframes once
    if (!document.getElementById('lt-pulse-style')) {
      var s = document.createElement('style');
      s.id = 'lt-pulse-style';
      s.textContent = '@keyframes lt-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.7)}}';
      document.head.appendChild(s);
    }
    // Update elapsed time every second
    var elapsedEl = t.querySelector('#lt-working-elapsed');
    var cancelBtn = t.querySelector('#lt-working-cancel');
    var iv = setInterval(function(){
      if (!document.body.contains(t)) { clearInterval(iv); return; }
      var seconds = Math.floor((Date.now() - startTs) / 1000);
      if (elapsedEl) elapsedEl.textContent = seconds;
    }, 1000);
    if (cancelBtn) cancelBtn.onclick = function(){
      try { abortController.abort(); } catch(e){}
      hideStillWorkingToast();
    };
    t._ltIv = iv;
  }
  function hideStillWorkingToast(){
    var t = document.getElementById('lt-working-toast');
    if (t) {
      try { if (t._ltIv) clearInterval(t._ltIv); } catch(e){}
      t.remove();
    }
  }

  // ── Preflight health check + circuit breaker ─────────────────────────────
  // Why: when a provider is misconfigured (no API key in Vercel env vars), every
  // single user request wastes 4 retry attempts before failing over. By calling
  // /api/health once and caching which providers are actually configured, we
  // can skip dead providers entirely and route straight to the working one.
  //
  // Also: short-term circuit breaker. If a provider fails 3 times in a row, we
  // open the circuit for 30 seconds — meaning we go straight to the other
  // provider during that window. This protects against cascading 529s when
  // Anthropic is briefly overloaded for everyone.
  window._ltHealth = { checked: false, anthropic: true, openai: true, elevenlabs: true };
  window._ltBreaker = {
    anthropic: { fails: 0, openUntil: 0 },
    openai:    { fails: 0, openUntil: 0 },
  };
  var BREAKER_THRESHOLD = 3;       // 3 consecutive failures opens the breaker
  var BREAKER_OPEN_MS  = 30_000;   // breaker stays open for 30 seconds

  function checkHealth(){
    if (isPreview) return Promise.resolve(); // health endpoint only meaningful in prod
    return _origFetch('/api/health', { cache:'no-store' })
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(j){
        if (!j) return;
        window._ltHealth = {
          checked: true,
          anthropic: !!(j.keys && j.keys.anthropic && j.keys.anthropic.configured),
          openai:    !!(j.keys && j.keys.openai    && j.keys.openai.configured),
          elevenlabs:!!(j.keys && j.keys.elevenlabs&& j.keys.elevenlabs.configured),
        };
        if (!window._ltHealth.anthropic && !window._ltHealth.openai) {
          showFallbackToast('⚠️ No AI providers configured — see /api/health', 8000);
        } else if (!window._ltHealth.anthropic) {
          showFallbackToast('Lesson Teacher not configured — using Co Lesson Teacher', 5000);
        } else if (!window._ltHealth.openai) {
          // Only warn — Anthropic is the primary anyway, so this isn't fatal.
          console.warn('[LT] Co Lesson Teacher (OpenAI) not configured — fallback unavailable');
        }
      })
      .catch(function(){
        // Health endpoint itself failed — assume best case and let the actual
        // request show the real error. Don't block the user.
      });
  }
  // Run health check once, shortly after page load
  if (document.readyState === 'complete') setTimeout(checkHealth, 800);
  else window.addEventListener('load', function(){ setTimeout(checkHealth, 800); });

  function breakerOpen(provider){
    var b = window._ltBreaker[provider];
    return b && b.openUntil > Date.now();
  }
  function breakerNoteFailure(provider){
    var b = window._ltBreaker[provider];
    if (!b) return;
    b.fails = (b.fails || 0) + 1;
    if (b.fails >= BREAKER_THRESHOLD) {
      b.openUntil = Date.now() + BREAKER_OPEN_MS;
      console.warn('[LT] Circuit breaker OPEN for ' + provider + ' for ' + (BREAKER_OPEN_MS/1000) + 's');
    }
  }
  function breakerNoteSuccess(provider){
    var b = window._ltBreaker[provider];
    if (!b) return;
    b.fails = 0;
    b.openUntil = 0;
  }

  // Wrap callServer to consult health and breaker BEFORE wasting a request
  function callServerSmart(which, init){
    var configuredKey = which === 'anthropic' ? 'anthropic' : 'openai';
    if (window._ltHealth.checked && !window._ltHealth[configuredKey]) {
      // Provider is known to be unconfigured — return a synthetic 503 immediately
      var msg = which.charAt(0).toUpperCase() + which.slice(1) + ' is not configured in Vercel.';
      return Promise.resolve(new Response(JSON.stringify({error: msg, hint:'Visit /api/health to verify.', provider: which}), {status:503, headers:{'Content-Type':'application/json'}}));
    }
    if (breakerOpen(configuredKey)) {
      var bmsg = which.charAt(0).toUpperCase() + which.slice(1) + ' temporarily skipped (circuit breaker).';
      return Promise.resolve(new Response(JSON.stringify({error: bmsg, provider: which, breaker:'open'}), {status:503, headers:{'Content-Type':'application/json'}}));
    }
    return callServer(which, init).then(function(r){
      if (r && r.ok) breakerNoteSuccess(configuredKey);
      else breakerNoteFailure(configuredKey);
      return r;
    }, function(err){
      breakerNoteFailure(configuredKey);
      throw err;
    });
  }

  function isFailureResponse(res){
    // Treat 4xx/5xx as failure for fallback purposes.
    return !res || !res.ok;
  }

  function summarizeErr(raw){
    if (!raw) return 'no response from server';
    try {
      var d = JSON.parse(raw);
      if (d.error && typeof d.error === 'string') return d.error + (d.hint ? ' ('+d.hint+')' : '');
      if (d.error && d.error.message) return d.error.message;
      if (d.detail) return typeof d.detail === 'string' ? d.detail.slice(0, 200) : JSON.stringify(d.detail).slice(0, 200);
    } catch(e){}
    return String(raw).slice(0, 200);
  }

  window.fetch = function(input, init){
    try {
      var url = (typeof input === 'string') ? input : (input && input.url) || '';
      if (url === '/api/anthropic' || url === '/api/openai'){
        var server = getServer();
        // Forced server
        if (server === '1' || url === '/api/anthropic' && server === '1'){
          return callServerSmart('anthropic', init).then(function(r){ window._ltLastProvider='anthropic'; refreshPill(); return r; });
        }
        if (server === '2' || url === '/api/openai'){
          return callServerSmart('openai', init).then(function(r){ window._ltLastProvider='openai'; refreshPill(); return r; });
        }
        // BOTH mode — query both teachers in parallel and combine
        if (server === 'both'){
          showFallbackToast('Asking Both Teachers… this takes a bit longer 🤝');
          return Promise.all([
            callServerSmart('anthropic', init).then(function(r){ return r.text().then(function(t){ return {ok:r.ok, status:r.status, raw:t}; }); }).catch(function(e){ return {ok:false, status:0, raw:String(e)}; }),
            callServerSmart('openai',   init).then(function(r){ return r.text().then(function(t){ return {ok:r.ok, status:r.status, raw:t}; }); }).catch(function(e){ return {ok:false, status:0, raw:String(e)}; })
          ]).then(function(results){
            function extract(r){
              if (!r || !r.ok) return '';
              try { var d = JSON.parse(r.raw); return (d.content && d.content[0] && d.content[0].text) || ''; } catch(e){ return ''; }
            }
            var a = extract(results[0]);
            var o = extract(results[1]);
            var combined;
            if (a && o) combined = '👩‍🏫 **Lesson Teacher says:**\n\n'+a+'\n\n---\n\n👨‍🏫 **Co Lesson Teacher adds:**\n\n'+o;
            else if (a || o) combined = a || o;
            else {
              combined =
                '⚠️ **Both teachers are currently busy.**\n\n' +
                '**Lesson Teacher:** ' + summarizeErr(results[0] && results[0].raw) + '\n\n' +
                '**Co Lesson Teacher:** ' + summarizeErr(results[1] && results[1].raw) + '\n\n' +
                'Open `/api/health` in your browser to verify the API keys are configured in Vercel.';
            }
            window._ltLastProvider = 'both'; refreshPill();
            var shape = { id:'both-'+Date.now(), type:'message', role:'assistant', model:'both-teachers', content:[{type:'text', text:combined}], stop_reason:'end_turn', usage:{input_tokens:0, output_tokens:0}, _provider:'both' };
            return new Response(JSON.stringify(shape), {status:200, headers:{'Content-Type':'application/json'}});
          });
        }
        // AUTO mode — try Anthropic, fall back to OpenAI on failure
        // If health check has marked anthropic as unconfigured, callServerSmart
        // will short-circuit and we'll fall through to OpenAI immediately —
        // saving the user 4 wasted retry attempts.
        return callServerSmart('anthropic', init).then(function(r){
          if (!isFailureResponse(r)){
            window._ltLastProvider='anthropic'; refreshPill();
            return r;
          }
          console.warn('[LT] Lesson Teacher failed ('+r.status+'), switching to Co Lesson Teacher…');
          showFallbackToast('Lesson Teacher unavailable → switched to Co Lesson Teacher');
          return r.text().then(function(anthropicErrText){
            return callServerSmart('openai', init).then(function(r2){
              if (!isFailureResponse(r2)){
                window._ltLastProvider='openai'; refreshPill();
                return r2;
              }
              // BOTH failed — surface real diagnostics inside an Anthropic-shaped reply
              return r2.text().then(function(openaiErrText){
                console.error('[LT] BOTH providers failed.', {anthropic: anthropicErrText, openai: openaiErrText});
                var diagMsg =
                  '⚠️ **Both teachers are currently busy.**\n\n' +
                  '**Lesson Teacher:** ' + summarizeErr(anthropicErrText) + '\n\n' +
                  '**Co Lesson Teacher:** ' + summarizeErr(openaiErrText) + '\n\n' +
                  '**What to try:**\n' +
                  '• Tap **Retry** below to try again\n' +
                  '• Check your internet connection\n' +
                  '• Open `/api/health` to verify API keys are configured in Vercel';
                showFailureToastWithRetry(input, init);
                window._ltLastProvider = null; refreshPill();
                var shape = { id:'err-'+Date.now(), type:'message', role:'assistant', model:'error', content:[{type:'text', text:diagMsg}], stop_reason:'end_turn', usage:{input_tokens:0, output_tokens:0}, _provider:'error' };
                return new Response(JSON.stringify(shape), {status:200, headers:{'Content-Type':'application/json'}});
              });
            });
          });
        }).catch(function(err){
          console.warn('[LT] Lesson Teacher errored, switching to Co Lesson Teacher:', err);
          showFallbackToast('Lesson Teacher errored → switched to Co Lesson Teacher');
          return callServerSmart('openai', init).then(function(r2){ window._ltLastProvider='openai'; refreshPill(); return r2; });
        });
      }
    } catch(e){}
    return _origFetch(input, init);
  };

  function showFallbackToast(msg, durationMs){
    var t = document.createElement('div');
    t.style.cssText = 'position:fixed;top:70px;right:14px;z-index:2147483647;background:#f59e0b;color:#000;padding:10px 14px;border-radius:10px;font:13px system-ui,sans-serif;font-weight:700;box-shadow:0 8px 24px rgba(0,0,0,.4);max-width:320px';
    t.textContent = msg;
    document.body.appendChild(t);
    var d = (typeof durationMs === 'number' && durationMs > 0) ? durationMs : 3500;
    setTimeout(function(){ t.style.transition='opacity .4s'; t.style.opacity='0'; setTimeout(function(){t.remove();}, 500); }, d);
  }

  // Failure toast with a Retry button — when both providers fail, give the
  // user one tap to try again instead of forcing them to re-type their message.
  // We re-trigger the failed request through window.fetch so it goes through
  // the full routing/health/breaker pipeline again.
  function showFailureToastWithRetry(input, init){
    var existing = document.getElementById('lt-fail-toast');
    if (existing) existing.remove();
    var t = document.createElement('div');
    t.id = 'lt-fail-toast';
    t.style.cssText = 'position:fixed;top:70px;right:14px;z-index:2147483647;background:#dc2626;color:#fff;padding:12px 14px;border-radius:12px;font:13px system-ui,sans-serif;font-weight:700;box-shadow:0 8px 24px rgba(0,0,0,.5);max-width:340px;display:flex;flex-direction:column;gap:8px';
    t.innerHTML =
      '<div>⚠️ Both teachers are busy</div>'
      +'<div style="font-weight:500;font-size:12px;opacity:.9">The retry button will resend your last request.</div>'
      +'<div style="display:flex;gap:6px;margin-top:2px">'
      +'  <button id="lt-fail-retry" style="flex:1;background:#fff;color:#dc2626;border:0;padding:7px 10px;border-radius:8px;font-weight:800;cursor:pointer">Retry</button>'
      +'  <button id="lt-fail-health" style="background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.3);padding:7px 10px;border-radius:8px;font-weight:600;cursor:pointer">Check status</button>'
      +'  <button id="lt-fail-close" title="Close" style="background:transparent;color:#fff;border:0;padding:0 6px;cursor:pointer;font-size:18px">×</button>'
      +'</div>';
    document.body.appendChild(t);
    var retryBtn = t.querySelector('#lt-fail-retry');
    var healthBtn = t.querySelector('#lt-fail-health');
    var closeBtn = t.querySelector('#lt-fail-close');
    if (retryBtn) retryBtn.onclick = function(){
      retryBtn.textContent = 'Retrying…';
      retryBtn.disabled = true;
      // Re-issue the original request — the router will pick it up again
      window.fetch(input, init).finally(function(){ try { t.remove(); } catch(e){} });
    };
    if (healthBtn) healthBtn.onclick = function(){ window.open('/api/health', '_blank', 'noopener'); };
    if (closeBtn) closeBtn.onclick = function(){ try { t.remove(); } catch(e){} };
    // Auto-dismiss after 30s if the user doesn't act on it
    setTimeout(function(){ if (document.getElementById('lt-fail-toast') === t) t.remove(); }, 30_000);
  }
})();

// Early shims so onclick attrs work before main script loads
(function(){
  function _safeGoTo(id){
    document.querySelectorAll('.page').forEach(function(p){ p.classList.remove('active'); });
    var el = document.getElementById(id);
    if(el){ el.classList.add('active'); window.scrollTo(0,0); }
  }
  if(typeof goTo          === 'undefined') window.goTo          = _safeGoTo;
  if(typeof showClasses   === 'undefined') window.showClasses   = function(section, btn){
    document.querySelectorAll('.lvl-btn').forEach(function(b){ b.classList.remove('on'); });
    if(btn) btn.classList.add('on');
    var cr = document.getElementById('classRow');
    if(cr) cr.style.display = 'block';
  };
  if(typeof enterClassroom === 'undefined') window.enterClassroom = function(){
    setTimeout(function(){ if(typeof enterCL === 'function') enterCL(); }, 400);
  };
})();
