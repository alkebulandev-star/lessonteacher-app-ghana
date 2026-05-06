/* ════════════════════════════════════════════════════════════════
   AUTH UI — sign-up, sign-in, account button, parent-link helper
   Depends on:  firebase-0.js  (window.LTAuth, window.LTCloud)
   ════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

// ───────────── helpers ─────────────
function el(tag, attrs, html){
  var n = document.createElement(tag);
  if (attrs){
    Object.keys(attrs).forEach(function(k){
      if (k === 'style') n.style.cssText = attrs[k];
      else if (k === 'class') n.className = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
  }
  if (html != null) n.innerHTML = html;
  return n;
}
function $(sel, root){ return (root || document).querySelector(sel); }

var STYLES_INJECTED = false;
function injectStyles(){
  if (STYLES_INJECTED) return;
  STYLES_INJECTED = true;
  var s = document.createElement('style');
  s.id = 'lt-auth-styles';
  s.textContent = `
    .lt-auth-backdrop{position:fixed;inset:0;background:rgba(8,14,26,.88);backdrop-filter:blur(8px);z-index:2147483640;display:flex;align-items:center;justify-content:center;padding:20px;animation:ltFade .15s ease-out}
    @keyframes ltFade{from{opacity:0}to{opacity:1}}
    .lt-auth-card{
      width:100%;max-width:440px;background:#0f1824;color:#f0f4ff;
      border:1px solid rgba(255,255,255,.1);border-radius:18px;
      box-shadow:0 30px 80px rgba(0,0,0,.6);
      padding:28px 24px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;
      max-height:92vh;overflow-y:auto;
    }
    .lt-auth-card h2{
      font-family:'Bricolage Grotesque',sans-serif;
      font-size:1.6rem;font-weight:800;margin:0 0 4px;color:#fff;
    }
    .lt-auth-card .lt-auth-sub{color:rgba(255,255,255,.6);font-size:.9rem;margin-bottom:18px}
    .lt-auth-tabs{display:flex;gap:8px;margin:0 0 16px;background:rgba(255,255,255,.04);border-radius:10px;padding:4px}
    .lt-auth-tab{
      flex:1;padding:10px;background:transparent;color:rgba(255,255,255,.55);
      border:0;border-radius:8px;font-weight:700;font-size:.92rem;cursor:pointer;
      transition:all .15s;font-family:inherit;
    }
    .lt-auth-tab.on{background:rgba(37,99,235,.25);color:#fff}
    .lt-field{margin-bottom:12px}
    .lt-field label{display:block;font-size:.78rem;font-weight:700;color:rgba(255,255,255,.7);margin-bottom:5px;letter-spacing:.04em;text-transform:uppercase}
    .lt-field input,.lt-field select{
      width:100%;padding:11px 14px;background:rgba(255,255,255,.06);
      border:1px solid rgba(255,255,255,.1);color:#fff;border-radius:9px;
      font-size:.95rem;font-family:inherit;outline:none;transition:border-color .15s;
      box-sizing:border-box;
    }
    .lt-field input:focus,.lt-field select:focus{border-color:#3b82f6}
    .lt-field select option{background:#0f1824;color:#fff}
    .lt-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .lt-roles{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px}
    .lt-role{
      padding:14px 10px;background:rgba(255,255,255,.04);
      border:1px solid rgba(255,255,255,.1);border-radius:10px;
      cursor:pointer;text-align:center;transition:all .15s;font-family:inherit;
    }
    .lt-role .lt-role-emoji{font-size:1.6rem;display:block;margin-bottom:4px}
    .lt-role .lt-role-label{font-weight:700;color:#fff;font-size:.85rem}
    .lt-role .lt-role-desc{color:rgba(255,255,255,.55);font-size:.7rem;margin-top:2px}
    .lt-role.on{background:rgba(37,99,235,.2);border-color:#3b82f6;box-shadow:0 0 0 2px rgba(59,130,246,.25)}
    .lt-auth-submit{
      width:100%;padding:13px;background:linear-gradient(135deg,#2563eb,#1d4ed8);
      color:#fff;border:0;border-radius:9px;font-weight:800;font-size:.98rem;
      cursor:pointer;transition:all .15s;margin-top:6px;font-family:inherit;
    }
    .lt-auth-submit:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 6px 20px rgba(37,99,235,.4)}
    .lt-auth-submit:disabled{opacity:.6;cursor:wait}
    .lt-auth-error{
      background:rgba(220,38,38,.15);border:1px solid rgba(220,38,38,.4);
      color:#fca5a5;padding:10px 12px;border-radius:8px;font-size:.85rem;
      margin-bottom:12px;
    }
    .lt-auth-success{
      background:rgba(16,185,129,.15);border:1px solid rgba(16,185,129,.4);
      color:#6ee7b7;padding:10px 12px;border-radius:8px;font-size:.85rem;
      margin-bottom:12px;
    }
    .lt-auth-link{
      background:none;border:0;color:#60a5fa;font-size:.85rem;cursor:pointer;
      padding:6px 0;text-decoration:underline;font-family:inherit;
    }
    .lt-auth-close{
      position:absolute;top:14px;right:14px;background:rgba(255,255,255,.08);
      border:0;color:#fff;width:32px;height:32px;border-radius:50%;cursor:pointer;
      font-size:18px;font-weight:600;display:flex;align-items:center;justify-content:center;
    }
    .lt-auth-card{position:relative}

    /* Account chip / button (top-right of nav, when applicable) */
    .lt-acct-chip{
      display:inline-flex;align-items:center;gap:8px;
      padding:6px 12px;background:rgba(255,255,255,.08);
      border:1px solid rgba(255,255,255,.12);border-radius:100px;
      cursor:pointer;font-family:inherit;color:#fff;font-size:.85rem;font-weight:600;
    }
    .lt-acct-chip:hover{background:rgba(255,255,255,.14)}
    .lt-acct-emoji{font-size:1rem}
    .lt-acct-menu{
      position:absolute;background:#0f1824;border:1px solid rgba(255,255,255,.12);
      border-radius:12px;padding:8px;min-width:220px;box-shadow:0 12px 40px rgba(0,0,0,.5);
      z-index:2147483641;
    }
    .lt-acct-menu .lt-acct-info{padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.08);margin-bottom:6px}
    .lt-acct-menu .lt-acct-info b{color:#fff;display:block;font-size:.92rem}
    .lt-acct-menu .lt-acct-info span{color:rgba(255,255,255,.6);font-size:.78rem}
    .lt-acct-menu button{
      width:100%;text-align:left;padding:9px 12px;background:none;border:0;color:#e2e8f0;
      border-radius:7px;cursor:pointer;font-family:inherit;font-size:.88rem;
    }
    .lt-acct-menu button:hover{background:rgba(255,255,255,.06)}
    .lt-acct-menu button.lt-acct-danger{color:#fca5a5}
  `;
  document.head.appendChild(s);
}

// ───────────── Auth modal ─────────────
var modalOpen = false;

function closeModal(){
  var bd = document.querySelector('.lt-auth-backdrop');
  if (bd) bd.remove();
  modalOpen = false;
}

function openAuthModal(opts){
  if (modalOpen) return;
  modalOpen = true;
  injectStyles();
  opts = opts || {};
  var startMode = opts.mode || 'signin';   // 'signin' | 'signup'
  var afterAuth = opts.onAuth || function(){};
  var initialRole = opts.role || 'student';

  var bd = el('div', { 'class':'lt-auth-backdrop' });
  var card = el('div', { 'class':'lt-auth-card' });
  bd.appendChild(card);
  document.body.appendChild(bd);
  bd.addEventListener('click', function(e){ if (e.target === bd) closeModal(); });

  function render(mode){
    card.innerHTML = '';
    card.appendChild(el('button', { 'class':'lt-auth-close', 'aria-label':'Close' }, '×'));
    card.querySelector('.lt-auth-close').onclick = closeModal;

    card.appendChild(el('h2', null, mode === 'signup' ? 'Create your account' : 'Welcome back'));
    card.appendChild(el('p', { 'class':'lt-auth-sub' },
      mode === 'signup'
        ? 'Save your progress, sync across devices, and link parents to students.'
        : 'Sign in to continue your learning journey.'
    ));

    // Tabs
    var tabs = el('div', { 'class':'lt-auth-tabs' });
    var tabIn = el('button', { 'class':'lt-auth-tab' + (mode==='signin'?' on':'') }, 'Sign in');
    var tabUp = el('button', { 'class':'lt-auth-tab' + (mode==='signup'?' on':'') }, 'Sign up');
    tabs.appendChild(tabIn); tabs.appendChild(tabUp);
    card.appendChild(tabs);
    tabIn.onclick = function(){ render('signin'); };
    tabUp.onclick = function(){ render('signup'); };

    // Error / status holder
    var status = el('div');
    card.appendChild(status);
    function setError(msg){ status.innerHTML = ''; status.appendChild(el('div',{ 'class':'lt-auth-error' }, msg)); }
    function setOk(msg){ status.innerHTML = ''; status.appendChild(el('div',{ 'class':'lt-auth-success' }, msg)); }
    function clearStatus(){ status.innerHTML = ''; }

    if (mode === 'signup'){
      // Role picker
      card.appendChild(el('label', { style:'display:block;font-size:.78rem;font-weight:700;color:rgba(255,255,255,.7);margin-bottom:5px;letter-spacing:.04em;text-transform:uppercase' }, 'I am a…'));
      var roles = el('div', { 'class':'lt-roles' });
      var rStudent = el('button',
        { 'class':'lt-role' + (initialRole==='student'?' on':''), type:'button' },
        '<span class="lt-role-emoji">🎓</span><div class="lt-role-label">Student</div><div class="lt-role-desc">Learn lessons, take exams</div>'
      );
      var rParent = el('button',
        { 'class':'lt-role' + (initialRole==='parent'?' on':''), type:'button' },
        '<span class="lt-role-emoji">👨‍👩‍👧</span><div class="lt-role-label">Parent</div><div class="lt-role-desc">Track your child\'s progress</div>'
      );
      roles.appendChild(rStudent); roles.appendChild(rParent);
      card.appendChild(roles);
      var role = initialRole;
      function pickRole(r, btn){
        role = r;
        roles.querySelectorAll('.lt-role').forEach(function(b){ b.classList.remove('on'); });
        btn.classList.add('on');
        // Toggle student-only fields
        toggleStudentFields();
      }
      rStudent.onclick = function(){ pickRole('student', rStudent); };
      rParent.onclick  = function(){ pickRole('parent',  rParent); };

      // Social sign-in (Google + Apple)
      card.appendChild(makeSocialSignIn(function(){ return role; }, status, afterAuth, function(){ closeModal(); }));
      card.appendChild(makeDivider('or sign up with email'));

      // Name
      var fName = el('div', { 'class':'lt-field' },
        '<label>Full name</label><input type="text" id="ltAuthName" required autocomplete="name" />');
      card.appendChild(fName);

      // Email + password row
      var fEmail = el('div', { 'class':'lt-field' },
        '<label>Email</label><input type="email" id="ltAuthEmail" required autocomplete="email" />');
      card.appendChild(fEmail);

      var fPass = el('div', { 'class':'lt-field' },
        '<label>Password (min 6)</label><input type="password" id="ltAuthPass" required minlength="6" autocomplete="new-password" />');
      card.appendChild(fPass);

      // Student-only: section + class
      var fStudent = el('div', { id:'ltStudentFields' });
      fStudent.innerHTML =
        '<div class="lt-field">' +
          '<label>Level</label>' +
          '<select id="ltAuthSection">' +
            '<option value="">Choose your level</option>' +
            '<option value="kids">Kids Zone (Ages 4–10)</option>' +
            '<option value="primary">Basic 1–6</option>' +
            '<option value="jss">Junior Secondary (JHS 1–3)</option>' +
            '<option value="sss">Senior High (SHS 1–3)</option>' +
          '</select>' +
        '</div>' +
        '<div class="lt-field">' +
          '<label>Class</label>' +
          '<select id="ltAuthClass"><option value="">Pick level first</option></select>' +
        '</div>' +
        '<div class="lt-field" id="ltAuthStreamWrap" style="display:none">' +
          '<label>Programme (SHS only)</label>' +
          '<select id="ltAuthStream">' +
            '<option value="science">General Science</option>' +
            '<option value="arts">General Arts</option>' +
            '<option value="business">Business</option>' +
            '<option value="visual">Visual Arts</option>' +
            '<option value="home">Home Economics</option>' +
            '<option value="agric">Agricultural Science</option>' +
            '<option value="technical">Technical</option>' +
          '</select>' +
        '</div>' +
        '<div class="lt-row">' +
          '<div class="lt-field"><label>School (optional)</label><input type="text" id="ltAuthSchool" /></div>' +
          '<div class="lt-field"><label>Region</label>' +
            '<select id="ltAuthState"><option value="">—</option>' +
              ['Greater Accra','Ashanti','Central','Western','Western North','Eastern','Volta','Oti','Northern','Savannah','North East','Upper East','Upper West','Bono','Bono East','Ahafo'].map(function(s){ return '<option>'+s+'</option>';}).join('') +
            '</select>' +
          '</div>' +
        '</div>';
      card.appendChild(fStudent);

      function toggleStudentFields(){
        fStudent.style.display = (role === 'student') ? 'block' : 'none';
      }
      toggleStudentFields();

      // Wire section → class options
      var classOpts = {
        kids:    [['early','Ages 4–6'],['upper','Ages 7–10']],
        primary: [['P1','Basic 1'],['P2','Basic 2'],['P3','Basic 3'],['P4','Basic 4'],['P5','Basic 5'],['P6','Basic 6']],
        jss:     [['JHS 1','JHS 1'],['JHS 2','JHS 2'],['JHS 3','JHS 3']],
        sss:     [['SHS 1','SHS 1'],['SHS 2','SHS 2'],['SHS 3','SHS 3']]
      };
      function wireSection(){
        var sec = $('#ltAuthSection', card).value;
        var cls = $('#ltAuthClass', card);
        var stream = $('#ltAuthStreamWrap', card);
        if (!sec){ cls.innerHTML = '<option value="">Pick level first</option>'; stream.style.display='none'; return; }
        cls.innerHTML = classOpts[sec].map(function(o){ return '<option value="'+o[0]+'">'+o[1]+'</option>';}).join('');
        stream.style.display = (sec === 'sss') ? 'block' : 'none';
      }
      $('#ltAuthSection', card).addEventListener('change', wireSection);

      var submit = el('button', { 'class':'lt-auth-submit', type:'button' }, 'Create account');
      card.appendChild(submit);
      submit.onclick = async function(){
        clearStatus();
        var name  = ($('#ltAuthName',  card).value || '').trim();
        var email = ($('#ltAuthEmail', card).value || '').trim();
        var pass  = ($('#ltAuthPass',  card).value || '');
        if (!name)  return setError('Please enter your full name.');
        if (!email) return setError('Email is required.');
        if (pass.length < 6) return setError('Password must be at least 6 characters.');

        var profile = { role: role, name: name };
        if (role === 'student'){
          profile.section    = $('#ltAuthSection', card).value;
          profile.classLevel = $('#ltAuthClass',   card).value;
          profile.school     = $('#ltAuthSchool',  card).value;
          profile.state      = $('#ltAuthState',   card).value;
          if (profile.section === 'sss') profile.stream = $('#ltAuthStream', card).value;
          if (!profile.section || !profile.classLevel) return setError('Please pick your level and class.');
        }

        submit.disabled = true; submit.textContent = 'Creating account…';
        try {
          await window.LTAuth.signUp(email, pass, profile);
          setOk('Account created — welcome!');
          setTimeout(function(){ closeModal(); afterAuth(window.LTAuth.user); }, 700);
        } catch(err){
          submit.disabled = false; submit.textContent = 'Create account';
          setError(humanError(err));
        }
      };

      var foot = el('div', { style:'text-align:center;margin-top:14px' });
      foot.innerHTML = '<button class="lt-auth-link" type="button">Already have an account? Sign in</button>';
      card.appendChild(foot);
      foot.querySelector('button').onclick = function(){ render('signin'); };

    } else {
      // Sign in form
      // Social sign-in (Google + Apple)
      card.appendChild(makeSocialSignIn(function(){ return 'student'; }, status, afterAuth, function(){ closeModal(); }));
      card.appendChild(makeDivider('or sign in with email'));

      var fEmail = el('div', { 'class':'lt-field' },
        '<label>Email</label><input type="email" id="ltAuthEmail" required autocomplete="email" />');
      card.appendChild(fEmail);

      var fPass = el('div', { 'class':'lt-field' },
        '<label>Password</label><input type="password" id="ltAuthPass" required autocomplete="current-password" />');
      card.appendChild(fPass);

      var submit = el('button', { 'class':'lt-auth-submit', type:'button' }, 'Sign in');
      card.appendChild(submit);
      submit.onclick = async function(){
        clearStatus();
        var email = ($('#ltAuthEmail', card).value || '').trim();
        var pass  = ($('#ltAuthPass',  card).value || '');
        if (!email) return setError('Email is required.');
        if (!pass)  return setError('Password is required.');
        submit.disabled = true; submit.textContent = 'Signing in…';
        try {
          await window.LTAuth.signIn(email, pass);
          setOk('Signed in!');
          setTimeout(function(){ closeModal(); afterAuth(window.LTAuth.user); }, 500);
        } catch(err){
          submit.disabled = false; submit.textContent = 'Sign in';
          setError(humanError(err));
        }
      };

      var foot = el('div', { style:'text-align:center;margin-top:14px;display:flex;flex-direction:column;gap:6px' });
      foot.innerHTML =
        '<button class="lt-auth-link" type="button" data-act="signup">New here? Create an account</button>' +
        '<button class="lt-auth-link" type="button" data-act="reset" style="color:rgba(255,255,255,.5)">Forgot password?</button>';
      card.appendChild(foot);
      foot.querySelector('[data-act="signup"]').onclick = function(){ render('signup'); };
      foot.querySelector('[data-act="reset"]').onclick = async function(){
        var email = ($('#ltAuthEmail', card).value || '').trim();
        if (!email){ setError('Type your email above first, then tap "Forgot password?"'); return; }
        try { await window.LTAuth.resetPassword(email); setOk('Password reset link sent to ' + email); }
        catch(err){ setError(humanError(err)); }
      };
    }
  }

  render(startMode);
}

// ───────────── Social sign-in helpers ─────────────
function makeSocialSignIn(getRole, statusEl, afterAuth, closeFn){
  var wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-bottom:14px;';
  // Google
  var gBtn = document.createElement('button');
  gBtn.type = 'button';
  gBtn.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:10px;padding:11px 14px;background:#fff;color:#1f2937;border:0;border-radius:9px;font-weight:700;font-size:.92rem;cursor:pointer;font-family:inherit;transition:transform .1s;';
  gBtn.innerHTML =
    '<svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/></svg>' +
    '<span>Continue with Google</span>';
  gBtn.onmouseenter = function(){ gBtn.style.transform = 'translateY(-1px)'; };
  gBtn.onmouseleave = function(){ gBtn.style.transform = ''; };
  gBtn.onclick = async function(){
    if (!window.LTAuth || !window.LTAuth.ready){
      setStatusError(statusEl, 'Sign-in is still loading — try again in a moment.');
      return;
    }
    gBtn.disabled = true; gBtn.style.opacity = '.7';
    try {
      var role = (typeof getRole === 'function') ? getRole() : 'student';
      var u = await window.LTAuth.signInWithGoogle(role);
      if (!u) return; // redirect started
      setStatusOk(statusEl, 'Signed in with Google!');
      // If first-time student, the cloud doc has needsOnboarding=true.
      // The onChange handler in firebase-wiring will detect this and route accordingly.
      setTimeout(function(){
        if (closeFn) closeFn();
        if (typeof afterAuth === 'function') afterAuth(window.LTAuth.user);
      }, 600);
    } catch(err){
      gBtn.disabled = false; gBtn.style.opacity = '';
      setStatusError(statusEl, humanError(err));
    }
  };
  wrap.appendChild(gBtn);

  // Apple — placeholder until Apple Developer account is set up
  var aBtn = document.createElement('button');
  aBtn.type = 'button';
  aBtn.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:10px;padding:11px 14px;background:#000;color:#fff;border:1px solid rgba(255,255,255,.1);border-radius:9px;font-weight:700;font-size:.92rem;cursor:pointer;font-family:inherit;opacity:.55;';
  aBtn.innerHTML =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>' +
    '<span>Continue with Apple</span>';
  aBtn.title = 'Apple sign-in requires an Apple Developer account — coming soon';
  aBtn.onclick = function(){
    setStatusError(statusEl, 'Apple sign-in is not yet enabled. Use Google or email for now.');
  };
  wrap.appendChild(aBtn);

  return wrap;
}

function makeDivider(label){
  var d = document.createElement('div');
  d.style.cssText = 'display:flex;align-items:center;gap:10px;margin:2px 0 14px;color:rgba(255,255,255,.4);font-size:.78rem;font-weight:600;';
  d.innerHTML =
    '<div style="flex:1;height:1px;background:rgba(255,255,255,.1);"></div>' +
    '<span>' + escapeHtml(label || 'or') + '</span>' +
    '<div style="flex:1;height:1px;background:rgba(255,255,255,.1);"></div>';
  return d;
}

function setStatusError(host, msg){
  if (!host) return;
  host.innerHTML = '';
  var div = document.createElement('div');
  div.className = 'lt-auth-error';
  div.textContent = msg;
  host.appendChild(div);
}
function setStatusOk(host, msg){
  if (!host) return;
  host.innerHTML = '';
  var div = document.createElement('div');
  div.className = 'lt-auth-success';
  div.textContent = msg;
  host.appendChild(div);
}

function humanError(err){
  var raw  = (err && (err.message || err.code)) || String(err) || '';
  var code = (err && err.code) || '';
  // The full message often looks like "Firebase: Error (auth/<code>)." —
  // pull the auth/<code> out so we can match on it even if err.code is empty.
  if (!code){
    var mm = /\(auth\/([^)]+)\)/.exec(raw);
    if (mm) code = 'auth/' + mm[1];
  }
  // Friendlier copy for known codes (check FIRST, before generic stripping)
  if (/email-already-in-use/i.test(code))
    return 'That email is already registered. Try signing in instead.';
  if (/invalid-email/i.test(code))
    return 'That email address looks invalid. Check for typos or extra spaces.';
  if (/missing-email/i.test(code))
    return 'Email is required.';
  if (/missing-password/i.test(code))
    return 'Password is required.';
  if (/wrong-password|invalid-credential|invalid-login-credentials/i.test(code))
    return 'Wrong email or password. Try again.';
  if (/user-not-found/i.test(code))
    return 'No account with that email. Create one instead.';
  if (/user-disabled/i.test(code))
    return 'This account has been disabled. Contact support.';
  if (/weak-password/i.test(code))
    return 'Password is too weak (min 6 characters).';
  if (/too-many-requests/i.test(code))
    return 'Too many attempts. Wait a moment and try again.';
  if (/network-request-failed/i.test(code))
    return 'Network problem — check your connection and try again.';
  if (/operation-not-allowed/i.test(code))
    return 'This sign-in method is not enabled. Contact the administrator.';
  if (/popup-closed-by-user|cancelled-popup-request/i.test(code))
    return 'Sign-in was cancelled.';
  if (/unauthorized-domain/i.test(code))
    return 'This domain is not authorised for sign-in. Add it in Firebase Auth settings.';
  // Fallback: clean up the raw message
  var m = raw.replace(/^Firebase:\s*/, '').replace(/\s*\(auth\/[^)]+\)\.?$/, '').trim();
  if (!m || /^error\.?$/i.test(m)) m = 'Something went wrong. Please try again.';
  return m;
}

// ───────────── Account chip (header) ─────────────
function renderAccountChip(){
  // DEMO MODE: Don't render the sign-in chip when Firebase is disabled
  if (!window.LT_FIREBASE_CONFIG) {
    return;
  }
  
  // Try to find a navbar to host the chip. Different pages have different
  // headers; we hook the landing nav, classroom topbar, and any element
  // with class "nav-r" / id "topbarRight".
  injectStyles();

  function ensureChip(host){
    if (!host) return;
    if (host.querySelector('.lt-acct-chip')) {
      // Update label
      var existing = host.querySelector('.lt-acct-chip');
      var u = window.LTAuth && window.LTAuth.user;
      existing.innerHTML = u
        ? ('<span class="lt-acct-emoji">👤</span><span>' + escapeHtml(u.displayName || u.email.split('@')[0]) + '</span>')
        : ('<span class="lt-acct-emoji">🔐</span><span>Sign in</span>');
      return;
    }
    var btn = el('button', { 'class':'lt-acct-chip', type:'button' }, '');
    var u = window.LTAuth && window.LTAuth.user;
    btn.innerHTML = u
      ? ('<span class="lt-acct-emoji">👤</span><span>' + escapeHtml(u.displayName || u.email.split('@')[0]) + '</span>')
      : ('<span class="lt-acct-emoji">🔐</span><span>Sign in</span>');
    btn.onclick = function(e){
      e.stopPropagation();
      if (!window.LTAuth || !window.LTAuth.user){
        openAuthModal({ mode:'signin' });
      } else {
        showAccountMenu(btn);
      }
    };
    host.appendChild(btn);
  }

  // Landing nav
  var navR = document.querySelector('#pg-landing .nav-r');
  ensureChip(navR);
}

function showAccountMenu(anchor){
  // Close any existing
  document.querySelectorAll('.lt-acct-menu').forEach(function(m){ m.remove(); });
  injectStyles();
  var u = window.LTAuth.user || {};
  var menu = el('div', { 'class':'lt-acct-menu' });
  menu.innerHTML =
    '<div class="lt-acct-info">' +
      '<b>' + escapeHtml(u.displayName || 'Signed in') + '</b>' +
      '<span>' + escapeHtml(u.email || '') + '</span>' +
    '</div>' +
    '<button data-act="profile">⚙️ Profile &amp; settings</button>' +
    '<button data-act="dashboard">📈 My progress</button>' +
    '<button data-act="signout" class="lt-acct-danger">🚪 Sign out</button>';
  document.body.appendChild(menu);
  // Position under anchor
  var r = anchor.getBoundingClientRect();
  menu.style.top   = (r.bottom + 8) + 'px';
  menu.style.right = Math.max(8, window.innerWidth - r.right) + 'px';

  var close = function(e){
    if (menu.contains(e.target)) return;
    menu.remove();
    document.removeEventListener('click', close, true);
  };
  setTimeout(function(){ document.addEventListener('click', close, true); }, 10);

  menu.querySelector('[data-act="signout"]').onclick = async function(){
    try { await window.LTAuth.signOut(); } catch(e){}
    menu.remove();
    renderAccountChip();
  };
  menu.querySelector('[data-act="profile"]').onclick = function(){
    menu.remove();
    if (typeof window.goTo === 'function') window.goTo('pg-beta');
  };
  menu.querySelector('[data-act="dashboard"]').onclick = function(){
    menu.remove();
    var role = window._LT_LAST_PROFILE && window._LT_LAST_PROFILE.role;
    if (role === 'parent' && typeof window.goTo === 'function') window.goTo('pg-parent');
    else if (typeof window.goTo === 'function') window.goTo('pg-beta');
  };
}

function escapeHtml(s){
  return String(s||'').replace(/[&<>"']/g, function(c){
    return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
  });
}

// ───────────── Public API ─────────────
window.LTAuthUI = {
  open: openAuthModal,
  close: closeModal,
  refreshChip: renderAccountChip
};

// ───────────── Bootstrap ─────────────
var __ltAuthSubscribed = false;
function subscribeToAuth(){
  if (__ltAuthSubscribed) return;
  if (!window.LTAuth || typeof window.LTAuth.onChange !== 'function') return;
  __ltAuthSubscribed = true;
  window.LTAuth.onChange(function(user){
    window._LT_LAST_USER = user;
    renderAccountChip();
  });
}

function boot(){
  injectStyles();
  renderAccountChip();
  // firebase-0.js may not have run yet (it loads as a module, deferred).
  // Try to subscribe now; we'll also retry on the firebase-ready event.
  subscribeToAuth();
}

if (document.readyState === 'loading')
  document.addEventListener('DOMContentLoaded', boot);
else
  boot();

// Re-render chip whenever firebase initialises (modules run after classic
// scripts) and subscribe to auth changes if we haven't yet.
window.addEventListener('lt-firebase-ready', function(){
  subscribeToAuth();
  renderAccountChip();
});
window.addEventListener('lt-cloud-hydrated', function(){
  // Prefer the profile already cached by firebase-0.js to avoid a second
  // round-trip and the race window where _LT_LAST_PROFILE is briefly empty.
  if (window._LT_LAST_PROFILE){
    renderAccountChip();
    return;
  }
  if (window.LTCloud && window.LTCloud.loadProfile){
    window.LTCloud.loadProfile().then(function(p){
      window._LT_LAST_PROFILE = p;
      renderAccountChip();
    }).catch(function(){});
  }
});

})();
