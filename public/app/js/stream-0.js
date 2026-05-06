/* ════════════════════════════════════════════════════════════════
   LT STREAM — Anthropic streaming helper + progress UI
   ────────────────────────────────────────────────────────────────
   Two pieces:
     1. LTStream.fetchAnthropic(body, opts)
        - Calls /api/anthropic with stream:true
        - Reads SSE chunks as they arrive
        - Calls opts.onText(chunk) with each content delta
        - Calls opts.onSection(label) when a delimited section arrives
        - Resolves with the full text when the stream ends

     2. LTLessonProgress
        - A skeleton progress UI that shows what the lesson generator
          is currently writing. Tracks the <<<SECTION>>> delimiters
          and ticks each one as it completes.

   The progress UI is opt-in — homework-1.js calls
   LTLessonProgress.start(loadingEl) when a lesson load begins, and
   LTStream.fetchAnthropic feeds it section names as they arrive.

   This produces a dramatically better waiting experience without
   touching the existing lesson parser — the final render still
   happens once, from the complete text.
   ════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

// ─── SSE parser ─────────────────────────────────────────────────
// Anthropic streaming format (SSE):
//   event: content_block_delta
//   data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}
function parseSSE(buffer, onEvent){
  // Returns the leftover text after the last complete event.
  var lines = buffer.split('\n');
  var leftover = '';
  var event = null;
  var data = '';
  // If buffer doesn't end with \n, last line might be partial — keep it.
  if (!buffer.endsWith('\n')){
    leftover = lines.pop();
  }
  for (var i = 0; i < lines.length; i++){
    var line = lines[i];
    if (line === ''){
      // End of an event
      if (event && data){
        try {
          onEvent(event, JSON.parse(data));
        } catch(e){
          // Bad JSON — skip
        }
      }
      event = null; data = '';
      continue;
    }
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data += line.slice(5).trim();
    // Ignore other SSE fields (id:, retry:, comments)
  }
  return leftover;
}

// ─── Section delimiter tracking ────────────────────────────────
// Knows which <<<DELIMITER>>> markers exist in the lesson template,
// and reports each one as it appears in the stream.
var KNOWN_SECTIONS = [
  { key: 'OPENING',         label: 'Opening message' },
  { key: 'DEFINITION',      label: 'Definition' },
  { key: 'PARAGRAPH',       label: 'Explanation' },
  { key: 'ANALOGY',         label: 'Ghanaian analogy' },
  { key: 'STEP1_TITLE',     label: 'First concept' },
  { key: 'STEP2_TITLE',     label: 'Second concept' },
  { key: 'STEP3_TITLE',     label: 'Third concept' },
  { key: 'TUTOR_TIP',       label: 'Tutor tip' },
  { key: 'FORMULA',         label: 'Formula (if any)' },
  { key: 'WORKED_QUESTION', label: 'Worked example' },
  { key: 'TERM1',           label: 'Key terms' },
  { key: 'QUIZ_QUESTION',   label: 'Quick check question' }
];

// ─── LTLessonProgress — UI ─────────────────────────────────────
var LTLessonProgress = (function(){
  var rootEl = null;
  var listEl = null;
  var seenKeys = {};

  function start(targetEl){
    seenKeys = {};
    if (!targetEl){ return; }
    // Build the skeleton inside the loading element
    rootEl = document.createElement('div');
    rootEl.className = 'lt-lesson-progress';
    rootEl.setAttribute('data-no-translate', '1');
    rootEl.style.cssText = [
      'max-width:520px', 'margin:18px auto 0',
      'padding:14px 16px',
      'background:rgba(255,255,255,.04)',
      'border:1px solid rgba(255,255,255,.08)',
      'border-radius:12px',
      'font:500 .85rem "Plus Jakarta Sans",system-ui,sans-serif',
      'color:rgba(255,255,255,.85)',
      'text-align:left'
    ].join(';');
    rootEl.innerHTML =
      '<div style="font-weight:700;font-size:.78rem;color:rgba(255,255,255,.55);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;">Writing your lesson</div>' +
      '<div class="lt-lp-list" style="display:flex;flex-direction:column;gap:6px;"></div>';
    listEl = rootEl.querySelector('.lt-lp-list');

    KNOWN_SECTIONS.forEach(function(s){
      var row = document.createElement('div');
      row.className = 'lt-lp-row';
      row.setAttribute('data-key', s.key);
      row.style.cssText = 'display:flex;align-items:center;gap:10px;font-size:.85rem;color:rgba(255,255,255,.45);transition:color .2s;';
      row.innerHTML =
        '<span class="lt-lp-icon" style="display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,.18);border-radius:50%;flex-shrink:0;"></span>' +
        '<span class="lt-lp-label">' + s.label + '</span>';
      listEl.appendChild(row);
    });
    targetEl.appendChild(rootEl);
  }

  function noteSection(key){
    if (seenKeys[key]) return;
    seenKeys[key] = true;
    if (!listEl) return;
    var row = listEl.querySelector('[data-key="' + key + '"]');
    if (!row) return;
    row.style.color = 'rgba(110,231,183,.95)';
    var icon = row.querySelector('.lt-lp-icon');
    if (icon){
      icon.style.background = '#10b981';
      icon.style.borderColor = '#10b981';
      icon.style.boxShadow = '0 0 0 3px rgba(16,185,129,.18)';
      icon.innerHTML = '';
    }
  }

  function finish(){
    if (rootEl) rootEl.remove();
    rootEl = null; listEl = null; seenKeys = {};
  }

  function abort(){ finish(); }

  return { start: start, noteSection: noteSection, finish: finish, abort: abort };
})();

// ─── Detect section delimiters in incoming text ────────────────
function scanForSections(accumulated){
  // Returns the set of delimiter KEYS we've seen. Cheap regex scan.
  var found = {};
  KNOWN_SECTIONS.forEach(function(s){
    if (accumulated.indexOf('<<<' + s.key + '>>>') !== -1){
      found[s.key] = true;
    }
  });
  return found;
}

// ─── Public stream fetch ───────────────────────────────────────
async function fetchAnthropic(body, opts){
  opts = opts || {};
  var streaming = body && body.stream === true;
  var signal = opts.signal;
  var onText = opts.onText || function(){};
  var onSection = opts.onSection || function(){};
  var url = '/api/anthropic';

  var resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: signal
  });

  if (!resp.ok){
    var errText = '';
    try { errText = await resp.text(); } catch(_){}
    var err = new Error('http ' + resp.status);
    err.status = resp.status;
    err.detail = errText;
    throw err;
  }

  if (!streaming){
    // Non-streaming path — return parsed JSON like normal.
    var data = await resp.json();
    return { full: data, text: extractText(data) };
  }

  // Streaming path — read the SSE body progressively.
  var reader = resp.body && resp.body.getReader();
  if (!reader) throw new Error('no stream body');

  var decoder = new TextDecoder('utf-8');
  var buffer = '';
  var fullText = '';
  var seenSections = {};

  while (true){
    var chunk = await reader.read();
    if (chunk.done) break;
    if (signal && signal.aborted){ try { reader.cancel(); } catch(_){} throw new Error('aborted'); }
    buffer += decoder.decode(chunk.value, { stream: true });

    // Parse complete SSE events out of the buffer
    buffer = parseSSE(buffer, function(eventName, payload){
      if (eventName === 'content_block_delta' && payload && payload.delta && payload.delta.type === 'text_delta'){
        var t = payload.delta.text || '';
        fullText += t;
        onText(t, fullText);
        // Re-scan for section delimiters
        var nowSeen = scanForSections(fullText);
        Object.keys(nowSeen).forEach(function(k){
          if (!seenSections[k]){
            seenSections[k] = true;
            try { onSection(k); } catch(_){}
          }
        });
      } else if (eventName === 'message_stop'){
        // End-of-stream — nothing more to do
      } else if (eventName === 'error'){
        var msg = (payload && payload.error && payload.error.message) || 'stream error';
        throw new Error(msg);
      }
    });
  }

  // Flush any final decoder content
  buffer += decoder.decode();
  // Final scan in case the very last delimiter only closed at the end
  var lastSeen = scanForSections(fullText);
  Object.keys(lastSeen).forEach(function(k){
    if (!seenSections[k]){
      seenSections[k] = true;
      try { onSection(k); } catch(_){}
    }
  });

  return { text: fullText, sections: seenSections };
}

function extractText(data){
  if (!data || !data.content) return '';
  var t = '';
  if (Array.isArray(data.content)){
    for (var i = 0; i < data.content.length; i++){
      if (data.content[i] && data.content[i].type === 'text') t += data.content[i].text || '';
    }
  } else if (typeof data.content === 'string'){
    t = data.content;
  }
  return t;
}

window.LTStream = {
  fetchAnthropic: fetchAnthropic,
  Progress: LTLessonProgress
};

})();
