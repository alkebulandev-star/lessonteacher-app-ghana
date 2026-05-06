/* ════════════════════════════════════════════════════════════════
   THEORY-PAPER GENERATOR — UI WIRING
   ────────────────────────────────────────────────────────────────
   Adds a "🪄 Generate fresh AI paper" affordance to the theory exam
   rules screen. When clicked:
     1. Resolves board + subject from window._essayExamContext
     2. Calls ExamGen.generate({...}) — Anthropic primary / OpenAI fallback
     3. Replaces window._essayTopics with the AI questions
     4. Re-renders the topic grid using the existing loadEssayTopics
        markup pattern
     5. Shows a friendly progress banner while generating
     6. Falls back gracefully on error — keeps the canned topics

   The language layer (lang-0.js) injects "respond in [language]" into
   /api/anthropic and /api/openai, so AI papers come back in the
   chosen Twi / Ewe / Ga automatically.
   ════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

function boot(){
  // Watch for the essay rules screen showing up; inject the AI button
  // when it does. Use MutationObserver so we catch every navigation.
  var observer = new MutationObserver(function(){
    var screen = document.getElementById('essayRulesScreen');
    if (!screen) return;
    if (window.getComputedStyle(screen).display === 'none') return;
    if (screen.querySelector('.exg-ai-row')) return; // already injected
    injectAIButton(screen);
  });
  observer.observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:['style','class'] });

  // Also try once immediately
  setTimeout(function(){
    var screen = document.getElementById('essayRulesScreen');
    if (screen && !screen.querySelector('.exg-ai-row')) injectAIButton(screen);
  }, 600);
}

function injectAIButton(screen){
  var topicsCol = screen.querySelector('.erc-topics-col');
  if (!topicsCol) return;
  var hdr = topicsCol.querySelector('.erc-topics-hdr');
  if (!hdr) return;

  var row = document.createElement('div');
  row.className = 'exg-ai-row';
  row.style.cssText = [
    'display:flex','align-items:center','gap:8px',
    'margin:6px 0 10px',
    'padding:10px 12px',
    'background:linear-gradient(135deg,rgba(168,85,247,.12),rgba(59,130,246,.08))',
    'border:1px solid rgba(168,85,247,.25)',
    'border-radius:10px',
    'flex-wrap:wrap'
  ].join(';');
  row.innerHTML =
    '<div style="flex:1;min-width:160px;">' +
      '<div style="font-weight:700;color:#c4b5fd;font-size:.84rem;display:flex;align-items:center;gap:6px;">🪄 Fresh paper</div>' +
      '<div style="color:rgba(255,255,255,.62);font-size:.74rem;line-height:1.45;">AI-generated to match this exam\'s syllabus and structure exactly.</div>' +
    '</div>' +
    '<button class="exg-ai-btn" type="button" style="background:linear-gradient(135deg,#a855f7,#7c3aed);color:#fff;border:0;padding:8px 14px;border-radius:8px;font-weight:700;font-size:.82rem;cursor:pointer;font-family:inherit;white-space:nowrap;">Generate →</button>';
  topicsCol.insertBefore(row, hdr.nextSibling);

  row.querySelector('.exg-ai-btn').onclick = handleGenerate;
}

async function handleGenerate(){
  var btn = document.querySelector('.exg-ai-btn');
  if (!btn) return;
  if (!window.ExamGen || typeof window.ExamGen.generate !== 'function'){
    alert('Paper generator not available. Please reload.');
    return;
  }

  // Resolve board + subject from window._essayExamContext (set by ecStartPaper)
  // Fallback: look at the breadcrumb / top title.
  var ctx = window._essayExamContext || {};
  var board = (ctx.exam || resolveBoardFromUI() || 'WAEC').toString().toUpperCase();
  var rawKey = ctx.key || '';
  var subjectKey = String(rawKey).toLowerCase().replace(/-[a-z0-9]+$/,'');
  var subjectName = ctx.subj || '';

  if (!subjectKey){
    // Try to read currentSubject if available
    if (typeof window.currentSubject === 'string') subjectKey = window.currentSubject;
  }
  if (!subjectKey){
    alert('Please choose a subject first.');
    return;
  }

  if (board === 'WASSCE'){
    alert('WASSCE does not have a theory paper. WASSCE is objective only — please use Paper 1 instead.');
    return;
  }

  var origLabel = btn.textContent;
  btn.disabled = true;
  btn.style.opacity = '.7';
  btn.textContent = 'Generating…';
  showBanner('Generating fresh ' + board + ' paper… this takes 15-25 seconds');

  try {
    var topics = await window.ExamGen.generate({
      board: board,
      subject: subjectKey,
      subjectName: subjectName,
      // Generate enough for the full Paper-2 layout.
      // The existing flow honours window._essayTopics.length downstream.
      count: pickCount(board, subjectKey)
    });
    if (!topics || !topics.length) throw new Error('Empty paper from AI');

    // Tag with [BOARD] prefix in type for visual consistency
    topics = topics.map(function(t){
      return Object.assign({}, t, { type: '[' + board + '] ' + (t.type || '') });
    });

    window._essayTopics = topics;
    rerenderTopicGrid(topics);
    flashBanner('✓ Fresh paper ready — pick a question and start writing.', '#10b981');
  } catch(err){
    console.error('[ExamGen] generation failed', err);
    flashBanner('Could not generate. Showing the standard paper instead.', '#f59e0b');
  } finally {
    btn.disabled = false;
    btn.style.opacity = '';
    btn.textContent = origLabel;
  }
}

function pickCount(board, subjectKey){
  // Use the spec's questionsToShow if available
  if (window.ExamGen && typeof window.ExamGen.getSpec === 'function'){
    var spec = window.ExamGen.getSpec(board, subjectKey);
    if (spec && spec.questionsToShow) return spec.questionsToShow;
  }
  return 5;
}

function rerenderTopicGrid(topics){
  var grid = document.getElementById('essayTopicGrid');
  if (!grid) return;
  grid.innerHTML = topics.map(function(t, i){
    var badge = t.yr
      ? '<span style="font-size:.58rem;font-weight:800;background:rgba(168,85,247,.18);border:1px solid rgba(168,85,247,.32);color:#c4b5fd;padding:1px 6px;border-radius:4px;margin-left:6px">' + escapeHtml(t.yr) + '</span>'
      : '';
    return '<button class="erc-topic-btn" onclick="pickEssayTopic(' + i + ',this)">' +
      '<div class="erc-topic-type" style="display:flex;align-items:center">' + escapeHtml(t.type || '') + badge + '</div>' +
      '<div class="erc-topic-text">' + escapeHtml(t.q || '') + '</div>' +
    '</button>';
  }).join('');
}

function resolveBoardFromUI(){
  // Look at #ecBcExam breadcrumb or #ecTopTitle
  var bc = document.getElementById('ecBcExam');
  if (bc && bc.textContent) {
    var t = bc.textContent.trim().toUpperCase();
    if (/^(WAEC|WASSCE|WASSCE|BECE|NSMQ|)$/.test(t)) return t;
  }
  var top = document.getElementById('ecTopTitle');
  if (top && top.textContent){
    var m = top.textContent.match(/\b(WAEC|WASSCE|WASSCE|BECE|NSMQ|)\b/i);
    if (m) return m[1].toUpperCase();
  }
  return null;
}

// ─── Progress banner UI ─────────────────────────────────────
function showBanner(msg){
  hideBanner();
  var b = document.createElement('div');
  b.id = 'exg-banner';
  b.setAttribute('data-no-translate', '1');
  b.style.cssText = [
    'position:fixed','top:14px','left:50%','transform:translateX(-50%)',
    'z-index:2147483646',
    'background:rgba(15,24,36,.96)','backdrop-filter:blur(8px)',
    'border:1px solid rgba(168,85,247,.4)',
    'color:#fff',
    'font-family:"Plus Jakarta Sans",system-ui,sans-serif',
    'font-size:.86rem','font-weight:700',
    'padding:11px 18px',
    'border-radius:100px',
    'box-shadow:0 14px 40px rgba(0,0,0,.5)',
    'display:flex','align-items:center','gap:10px',
    'max-width:90vw'
  ].join(';');
  b.innerHTML =
    '<span style="display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;animation:exgSpin 1s linear infinite;"></span>' +
    '<span>' + escapeHtml(msg) + '</span>' +
    '<style>@keyframes exgSpin{to{transform:rotate(360deg)}}</style>';
  document.body.appendChild(b);
}
function flashBanner(msg, color){
  var b = document.getElementById('exg-banner');
  if (!b) {
    showBanner(msg);
    b = document.getElementById('exg-banner');
    if (b) b.querySelector('span').style.display = 'none';
  }
  b.style.borderColor = color || '#10b981';
  b.innerHTML = '<span>' + escapeHtml(msg) + '</span>';
  setTimeout(hideBanner, 3500);
}
function hideBanner(){
  var b = document.getElementById('exg-banner');
  if (b) b.remove();
}

function escapeHtml(s){
  return String(s||'').replace(/[&<>"']/g, function(c){
    return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
  });
}

})();
