/* ════════════════════════════════════════════════════════════════
   LT NAVIGATION — v13 nav foundation
   ────────────────────────────────────────────────────────────────
   Wraps the existing window.goTo with:
     • A history stack (so we can offer a real "Back" affordance)
     • Browser-history sync (so OS/hardware back button works)
     • Stale-content cleanup before transitions (cancels in-flight
       AI calls, clears lessonBody/chatBody/examBody)
     • Intent preservation across sign-in (if a logged-out user
       clicks "Enter Classroom", we remember and route them there
       after sign-up)
     • A consistent floating "← Back" button on every feature page
     • Debug logging via [NAV] in the console

   Public API:
     LTNav.go(pageId, opts?)      — same as goTo, but tracked
     LTNav.back()                 — pop one entry
     LTNav.current()              — current page id
     LTNav.history()              — array of recent pages
     LTNav.setIntent(intent)      — remember a destination across auth
     LTNav.consumeIntent()        — used by auth-success path
   ════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

var HOME = 'pg-landing';
// Pages where the back button should NOT appear.
var NO_BACK_PAGES = new Set(['pg-landing']);
// Pages we consider "feature pages" for sign-in gating logic, etc.
var stack = [];      // ['pg-landing', 'pg-classroom', ...]
var lastTo = null;
var lastFrom = null;
var pendingIntent = null;
var DEV_LOG = true;

function log(){
  if (!DEV_LOG) return;
  try {
    var args = Array.prototype.slice.call(arguments);
    args.unshift('[NAV]');
    console.log.apply(console, args);
  } catch(e){}
}

// Read current active page from DOM (in case other code switches without us)
function detectActive(){
  var actives = document.querySelectorAll('.page.active');
  if (!actives.length) return HOME;
  return actives[actives.length - 1].id || HOME;
}

// ─── Stale-content cleanup ──────────────────────────────────────
function cleanupBeforeNav(){
  // Cancel any in-flight AI lesson request
  try { if (typeof window._abortCurrentLesson === 'function') window._abortCurrentLesson(); } catch(e){}
  // Stop any TTS
  try { if (typeof window.stopAudio === 'function') window.stopAudio(); } catch(e){}
  try { if (typeof window.elevenStop === 'function') window.elevenStop(); } catch(e){}
  try { if (window.speechSynthesis && window.speechSynthesis.cancel) window.speechSynthesis.cancel(); } catch(e){}
  // Don't blanket-clear lesson/chat/exam bodies on EVERY nav — that
  // would lose state when coming back. Only clear if leaving the
  // classroom entirely. (Triggered explicitly from goTo logic below.)
}

function clearStaleClassroomContent(){
  // Called when leaving the classroom for an unrelated page.
  ['lessonBody', 'chatBody', 'hwChatMsgs'].forEach(function(id){
    var el = document.getElementById(id);
    if (el){
      el.__ltOrig = null;
      el.innerHTML = '';
    }
  });
}

// ─── Navigation wrap ────────────────────────────────────────────
function installWrap(){
  if (typeof window.goTo !== 'function'){
    setTimeout(installWrap, 200);
    return;
  }
  if (window.goTo.__ltNavHooked) return;

  var underlying = window.goTo;
  window.goTo = function(id){
    var from = lastTo || detectActive() || HOME;
    var to = id;
    log(from, '→', to);

    cleanupBeforeNav();

    // If leaving the classroom for something unrelated (not a sub-page
    // like the AI dock), clear stale classroom content.
    var classroomFamily = ['pg-classroom', 'pg-essay', 'pg-homework'];
    if (classroomFamily.indexOf(from) !== -1 && classroomFamily.indexOf(to) === -1){
      clearStaleClassroomContent();
    }

    // Push to internal stack (if it's a real change and not back-button rewind)
    if (to !== lastTo){
      // If this is a forward-navigation, drop anything ahead of us
      stack.push(to);
      lastFrom = from;
      lastTo = to;
      if (stack.length > 30) stack.shift();
    }

    // Browser history (so OS back button works)
    try {
      var st = { ltNav: true, page: to };
      if (history.state && history.state.ltNav && history.state.page === to){
        // already represents this state, skip
      } else {
        history.pushState(st, '', '#' + to);
      }
    } catch(e){}

    var result = underlying.apply(this, arguments);
    // After underlying runs the page is now visible — refresh back button
    setTimeout(refreshBackButton, 30);
    return result;
  };
  window.goTo.__ltNavHooked = true;
  log('navigation wrap installed; underlying =', underlying.name || '(anon)');
}

// ─── Back button rendering ─────────────────────────────────────
function refreshBackButton(){
  var current = detectActive();
  var btn = document.getElementById('lt-nav-back');

  if (NO_BACK_PAGES.has(current)){
    if (btn) btn.remove();
    return;
  }

  // Don't show our back button if the page already has one nearby
  // (e.g., the lesson topbar has its own ← arrow). Heuristic: a
  // visible button containing '←' inside the active page's first 80px.
  if (pageHasItsOwnBackButton(current)){
    if (btn) btn.remove();
    return;
  }

  if (!btn){
    btn = document.createElement('button');
    btn.id = 'lt-nav-back';
    btn.type = 'button';
    btn.setAttribute('data-no-translate', '1');
    btn.style.cssText = [
      'position:fixed', 'top:14px', 'left:14px',
      'z-index:2147483630',
      'background:rgba(15,24,36,.78)', 'backdrop-filter:blur(8px)',
      'color:#fff', 'border:1px solid rgba(255,255,255,.14)',
      'padding:8px 14px', 'border-radius:100px',
      'font:700 .85rem "Plus Jakarta Sans",system-ui,sans-serif',
      'cursor:pointer', 'box-shadow:0 4px 14px rgba(0,0,0,.3)',
      'display:flex', 'align-items:center', 'gap:6px'
    ].join(';');
    btn.innerHTML = '<span style="font-size:1rem;line-height:1;">←</span><span>Back</span>';
    btn.onclick = LTNav.back;
    document.body.appendChild(btn);
  }
  btn.style.display = '';
}

function pageHasItsOwnBackButton(pageId){
  var page = document.getElementById(pageId);
  if (!page) return false;
  // Look for buttons with an arrow-like glyph in the top of the page
  var existing = page.querySelectorAll('button, a');
  for (var i = 0; i < existing.length; i++){
    var el = existing[i];
    if (!el.offsetParent) continue;        // not visible
    var rect = el.getBoundingClientRect();
    if (rect.top > 80) continue;            // not at the top
    if (rect.left > 200) continue;          // not on the left
    var text = (el.textContent || '').trim();
    if (/^[←‹]/.test(text) || /\bback\b/i.test(text) || /\bexit\b/i.test(text)){
      return true;
    }
  }
  return false;
}

// ─── Back implementation ───────────────────────────────────────
function back(){
  // Prefer popping our own stack (gives a sensible default)
  if (stack.length > 1){
    stack.pop();                       // remove current
    var prev = stack[stack.length - 1];
    if (prev){
      log('back →', prev);
      lastTo = null;                   // force a fresh transition
      window.goTo(prev);
      return;
    }
  }
  // Otherwise go home
  log('back fallback → home');
  window.goTo(HOME);
}

// Hook browser back/forward (popstate)
window.addEventListener('popstate', function(e){
  var page = (e.state && e.state.page) || HOME;
  log('popstate →', page);
  // Avoid pushing this onto our stack — we're "rewinding"
  lastTo = null;
  // Don't pushState again
  var underlying = window.goTo;
  if (underlying && underlying.__ltNavHooked){
    // call the wrap but mark it as a popstate move
    suppressNextHistoryPush = true;
    try { window.goTo(page); }
    finally { suppressNextHistoryPush = false; }
  }
});
var suppressNextHistoryPush = false;

// ─── Intent preservation across sign-up ─────────────────────────
function setIntent(intent){
  pendingIntent = intent || null;
  log('intent stored:', intent);
}
function consumeIntent(){
  var i = pendingIntent;
  pendingIntent = null;
  return i;
}

// When auth completes, route to the intended destination.
window.addEventListener('lt-cloud-hydrated', function(){
  var intent = consumeIntent();
  if (intent && typeof intent === 'string'){
    log('post-auth, resuming intent →', intent);
    setTimeout(function(){
      try { window.goTo(intent); } catch(e){ console.warn(e); }
    }, 200);
  }
});

// ─── Public API ────────────────────────────────────────────────
var LTNav = {
  go: function(id, opts){ return window.goTo(id); },
  back: back,
  current: detectActive,
  history: function(){ return stack.slice(); },
  setIntent: setIntent,
  consumeIntent: consumeIntent,
  refreshBack: refreshBackButton
};
window.LTNav = LTNav;

// ─── Boot ──────────────────────────────────────────────────────
function boot(){
  installWrap();
  // Initialize stack with current page
  stack.push(detectActive());
  refreshBackButton();
  // Re-run the back button logic if other scripts mutate the active page
  setInterval(refreshBackButton, 1500);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

})();
