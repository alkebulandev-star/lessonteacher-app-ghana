/* ════════════════════════════════════════════════════════════════
   FIXES — bug fixes and small UI improvements
   - Stream filter: SSS science user shouldn't see Arts subjects
   - "My progress" routes to the actual progress page (pg-guidance),
     not the level-picker (pg-beta)
   - Arena cloud-game modal needs an exit button
   - Demo banner at top when ?demo=1 is set
   - Hide certain landing-page features unless signed in
   ════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

// ────────────────────────────────────────────────────────────────
// 1. Stream filter — strict syllabus filtering via CSS attribute selectors
// ────────────────────────────────────────────────────────────────
function patchStreamFilter(){
  // CSS-only approach — much more reliable than DOM patching:
  //   1. We set body[data-lt-stream="<stream>"] from chosenStream
  //   2. Inject CSS that hides .sb-item / .wc-subj-btn whose data-subj
  //      isn't in the stream's allowed set, scoped by body[data-lt-stream]
  //   3. Re-running renders don't break it — CSS reapplies automatically
  var ALLOWED = {
    science:    ['eng','mth','civ','bio','chm','phy','fmth','agr','cmp','dat','geo','eco'],
    arts:       ['eng','mth','civ','lit','gov','his','crs','fre','ara','fne','mus','eco','geo'],
    commercial: ['eng','mth','civ','acc','com','eco','biz','off','ins','cmp','geo'],
    technical:  ['eng','mth','civ','tdr','bld','auto','wdw','elc','mec','agr','cmp']
  };

  function buildCSS(){
    // For each stream, build a CSS rule:
    //   body[data-lt-stream="science"] .sb-item:not([data-subj="eng"]):not([data-subj="mth"])... { display:none }
    var rules = [];
    Object.keys(ALLOWED).forEach(function(stream){
      var notList = ALLOWED[stream].map(function(p){ return ':not([data-subj="'+p+'"])'; }).join('');
      rules.push('body[data-lt-stream="' + stream + '"][data-lt-section="sss"] #sbSubjects .sb-item' + notList + ' { display:none !important; }');
      // For welcome grid we also need to read the prefix from onclick="startFromWelcome('eng-s2'...)" — we'll add data-subj on those via a small init.
      // Cover the case where wc-subj-btn already has data-subj (set by code we'll add):
      rules.push('body[data-lt-stream="' + stream + '"][data-lt-section="sss"] #wcSubjGrid .wc-subj-btn' + notList + ' { display:none !important; }');
    });
    return rules.join('\n');
  }

  var styleEl = document.getElementById('lt-stream-css');
  if (!styleEl){
    styleEl = document.createElement('style');
    styleEl.id = 'lt-stream-css';
    styleEl.textContent = buildCSS();
    document.head.appendChild(styleEl);
  }

  function syncBodyAttrs(){
    var section = window.chosenSection || '';
    var stream  = window.chosenStream  || '';
    if (section === 'sss'){
      document.body.setAttribute('data-lt-section', 'sss');
      // Default to science if nothing set
      var s = ALLOWED[stream] ? stream : 'science';
      document.body.setAttribute('data-lt-stream', s);
    } else {
      document.body.removeAttribute('data-lt-section');
      document.body.removeAttribute('data-lt-stream');
    }
  }

  // Add data-subj to welcome-screen buttons (they only have it via onclick attr)
  function decorateWelcomeButtons(){
    document.querySelectorAll('#wcSubjGrid .wc-subj-btn').forEach(function(btn){
      if (btn.hasAttribute('data-subj')) return;
      var oc = btn.getAttribute('onclick') || '';
      var m = oc.match(/startFromWelcome\(['"]([a-z]+)/);
      if (m) btn.setAttribute('data-subj', m[1]);
    });
  }

  // Wrap the existing build functions to sync attrs / decorate after each render.
  function hookOriginalBuilders(){
    if (typeof window.buildSidebar === 'function' && !window.buildSidebar.__streamHooked){
      var orig1 = window.buildSidebar;
      window.buildSidebar = function(){
        var r = orig1.apply(this, arguments);
        syncBodyAttrs();
        return r;
      };
      window.buildSidebar.__streamHooked = true;
    }
    if (typeof window.buildWelcomeScreen === 'function' && !window.buildWelcomeScreen.__streamHooked){
      var orig2 = window.buildWelcomeScreen;
      window.buildWelcomeScreen = function(){
        var r = orig2.apply(this, arguments);
        syncBodyAttrs();
        decorateWelcomeButtons();
        return r;
      };
      window.buildWelcomeScreen.__streamHooked = true;
    }
  }

  // The original functions might not exist yet at boot (homework-1.js
  // is loaded but functions defined inside it become globals immediately
  // for `function` declarations — so this check should pass).
  hookOriginalBuilders();
  // Try again after a delay in case order is wrong
  setTimeout(hookOriginalBuilders, 500);
  setTimeout(syncBodyAttrs, 200);
  setTimeout(syncBodyAttrs, 1000);
  setTimeout(syncBodyAttrs, 2500);
  // Also run when profile hydrates
  window.addEventListener('lt-cloud-hydrated', function(){
    setTimeout(function(){ syncBodyAttrs(); decorateWelcomeButtons(); }, 200);
  });
  // Diagnostic — let user verify what we resolved
  try {
    console.log('[stream-filter] css installed, allowed prefixes per stream:', ALLOWED);
  } catch(e){}
}

// ────────────────────────────────────────────────────────────────
// 2. "My progress" account-menu button — route to real progress page
// ────────────────────────────────────────────────────────────────
function patchMyProgressRouting(){
  // We patch by finding the global click handler on the menu button.
  // Because auth-ui-0.js builds the menu on demand, we can't patch
  // the click directly. Instead, intercept goTo('pg-beta') calls
  // when they originate from a signed-in user clicking "My progress".
  // Simpler: intercept the menu rendering by watching the DOM.
  document.addEventListener('click', function(e){
    var btn = e.target.closest && e.target.closest('[data-act="dashboard"]');
    if (!btn) return;
    // We need to override what happens after auth-ui's handler runs.
    // The simplest path: schedule a goTo override after the click.
    setTimeout(function(){
      if (!window.LTAuth || !window.LTAuth.isSignedIn()) return;
      var role = window._LT_LAST_PROFILE && window._LT_LAST_PROFILE.role;
      if (role === 'student'){
        // Route to guidance (which shows the learning report)
        if (typeof window.goTo === 'function') window.goTo('pg-guidance');
      }
      // Parent role is already handled correctly by auth-ui
    }, 30);
  }, true); // capture phase so we run after auth-ui's handler
}

// ────────────────────────────────────────────────────────────────
// 3. Arena cloud-game modal — add exit button
// ────────────────────────────────────────────────────────────────
function patchArenaGameClose(){
  // Watch for the cloud game modal being created and inject a close button.
  var observer = new MutationObserver(function(mutations){
    mutations.forEach(function(m){
      m.addedNodes.forEach(function(node){
        if (!(node instanceof HTMLElement)) return;
        if (node.id === 'arCloudGame' || node.querySelector && node.querySelector('#arCloudGame')){
          var modal = node.id === 'arCloudGame' ? node : node.querySelector('#arCloudGame');
          if (!modal || modal.querySelector('.arcg-close')) return;
          var closeBtn = document.createElement('button');
          closeBtn.className = 'arcg-close';
          closeBtn.style.cssText = 'position:absolute;top:14px;right:14px;background:rgba(255,255,255,.1);color:#fff;border:1px solid rgba(255,255,255,.2);width:36px;height:36px;border-radius:50%;font-size:1.1rem;font-weight:700;cursor:pointer;z-index:10;display:flex;align-items:center;justify-content:center;';
          closeBtn.innerHTML = '✕';
          closeBtn.title = 'Leave game';
          closeBtn.onclick = function(){
            if (!confirm('Leave this game? Your score will not be saved.')) return;
            modal.remove();
          };
          // Make sure the inner card is positioned for the absolute btn
          var card = modal.querySelector('.ar-lobby-card');
          if (card){
            card.style.position = 'relative';
            card.appendChild(closeBtn);
          } else {
            modal.style.position = 'relative';
            modal.appendChild(closeBtn);
          }
        }
      });
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

// ────────────────────────────────────────────────────────────────
// 4. Demo banner — REMOVED in v13. Sign-up is now required.
// ────────────────────────────────────────────────────────────────
function injectDemoBanner(){
  // Hard-disable any leftover demo session marker. New rule: sign in or out.
  try { sessionStorage.removeItem('lt_demo'); } catch(e){}
  // If a leftover banner is in the DOM (cached page), nuke it.
  var b = document.getElementById('lt-demo-banner');
  if (b) b.remove();
  var s = document.getElementById('lt-demo-banner-push');
  if (s) s.remove();
}

// ────────────────────────────────────────────────────────────────
// 5. Hide user-only features from landing nav unless signed in
// ────────────────────────────────────────────────────────────────
function patchLandingNav(){
  // The landing nav has: Languages | Parent Hub | Enter Classroom CTA
  // The user said: "My progress" shouldn't be on landing — it's a
  // user feature.  We don't currently have a "My progress" link on
  // the landing nav, but we'll guard against any future additions.
  // We also conditionally-show "Parent Hub" — for signed-in students
  // it's hidden (they shouldn't access parent hub).
  function refresh(){
    if (window.LTIsDemo && window.LTIsDemo()) return; // demo: don't hide anything
    var role = (window._LT_LAST_PROFILE && window._LT_LAST_PROFILE.role) || null;
    var navR = document.querySelector('#pg-landing .nav-r');
    if (!navR) return;
    var parentLink = navR.querySelector('a[onclick*="pg-parent"]');
    if (parentLink){
      parentLink.style.display = (role === 'student') ? 'none' : '';
    }
  }
  refresh();
  if (window.LTAuth && typeof window.LTAuth.onChange === 'function'){
    window.LTAuth.onChange(refresh);
  }
  window.addEventListener('lt-cloud-hydrated', refresh);
}

// ────────────────────────────────────────────────────────────────
// 6. Mobile rules toggle on the exam-confirm screen
// ────────────────────────────────────────────────────────────────
function patchRulesToggle(){
  // Watch for the rules header showing up and hook a tap to toggle.
  document.addEventListener('click', function(e){
    var hdr = e.target.closest && e.target.closest('.erc-rules-hdr');
    if (!hdr) return;
    if (window.innerWidth > 640) return; // only collapse on mobile
    var col = hdr.closest('.erc-rules-col');
    if (col) col.classList.toggle('expanded');
  }, false);
}

// ────────────────────────────────────────────────────────────────
// 7. Role label in account menu — show "Parent" or "Student"
// ────────────────────────────────────────────────────────────────
function patchRoleLabel(){
  // Watch for account menu being injected, then add role row
  var mo = new MutationObserver(function(mutations){
    mutations.forEach(function(m){
      m.addedNodes.forEach(function(node){
        if (!(node instanceof HTMLElement)) return;
        if (!node.classList || !node.classList.contains('lt-acct-menu')) {
          // also check children
          var menu = node.querySelector && node.querySelector('.lt-acct-menu');
          if (menu) injectRoleRow(menu);
          return;
        }
        injectRoleRow(node);
      });
    });
  });
  mo.observe(document.body, { childList:true, subtree:true });
}
function injectRoleRow(menu){
  if (!menu || menu.querySelector('.lt-acct-role')) return;
  var profile = window._LT_LAST_PROFILE;
  if (!profile || !profile.role) return;
  var roleLabel = profile.role === 'parent' ? '👨‍👩‍👧 Parent' : (profile.role === 'student' ? '🎓 Student' : profile.role);
  var info = menu.querySelector('.lt-acct-info');
  if (!info) return;
  var pill = document.createElement('span');
  pill.className = 'lt-acct-role';
  pill.textContent = roleLabel;
  pill.style.cssText = 'display:inline-block;margin-top:6px;padding:3px 9px;background:rgba(251,191,36,.14);border:1px solid rgba(251,191,36,.3);color:#fbbf24;border-radius:100px;font-size:.7rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;';
  info.appendChild(pill);
}

// ────────────────────────────────────────────────────────────────
// 8. Remove "Enter Classroom" CTA from landing nav unless demo
// ────────────────────────────────────────────────────────────────
function patchLandingEnterCTA(){
  // Per spec: "Enter Classroom" should only appear on the demo banner
  // (which already has its own "Enter classroom" if demo mode), not on
  // the public landing nav. Hide the nav CTA in non-demo mode.
  function refresh(){
    if (window.LTIsDemo && window.LTIsDemo()) return; // demo: leave it
    document.querySelectorAll('#pg-landing .nav-cta').forEach(function(btn){
      // Only hide if it actually says "Enter Classroom"
      if (/enter classroom/i.test(btn.textContent || '')){
        btn.style.display = 'none';
      }
    });
    // Also the mobile drawer one
    document.querySelectorAll('#pg-landing .l-mobile-drawer .nav-cta').forEach(function(btn){
      if (/enter classroom/i.test(btn.textContent || '')){
        btn.style.display = 'none';
      }
    });
  }
  refresh();
  // Re-run after DOM changes (some scripts re-render the nav)
  setInterval(refresh, 1500);
}

// ────────────────────────────────────────────────────────────────
// Bootstrap
// ────────────────────────────────────────────────────────────────
function boot(){
  patchStreamFilter();
  patchMyProgressRouting();
  patchArenaGameClose();
  injectDemoBanner();
  patchLandingNav();
  patchRulesToggle();
  patchRoleLabel();
  patchLandingEnterCTA();
}

if (document.readyState === 'loading')
  document.addEventListener('DOMContentLoaded', boot);
else
  boot();

})();
