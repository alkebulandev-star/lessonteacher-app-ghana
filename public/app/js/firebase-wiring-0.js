/* ════════════════════════════════════════════════════════════════
   WIRING — connect Firebase auth + cloud to the existing app
   - Patches enterCL() so signed-in students skip the level/name step
   - Adds "Link a real student" UI to the Parent Hub (Progress tab)
   - Real parent dashboard: replaces fake activity chart with linked
     child's real dailySessions / quiz results / exam results
   - Role-based access (students can't enter Parent Hub by default;
     parents can see the full site).  ?demo=1 disables all gating.
   - Weekend / earned-fun-time gate on Live Arena (games)
   - Wires arena leaderboard to cloud when available
   - Fixes recordTopicComplete so quiz completion actually bumps
     topicsCompleted (the original function had a recursion bug)
   ════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

// ────────────────────────────────────────────────────────────────
// Demo / debug flags
// ────────────────────────────────────────────────────────────────
function isDemoMode(){
  // Demo mode removed in v13. Sign-in is required for all feature pages.
  // Any leftover ?demo=1 URL or session marker is ignored.
  return false;
}
window.LTIsDemo = isDemoMode;

window.addEventListener('lt-firebase-ready', function(){
  attachAll();
});
window.addEventListener('lt-cloud-hydrated', function(){
  refreshLinkPanelIfMounted();
  refreshAccountChip();
});

if (document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', attachAll);
} else {
  attachAll();
}

var ATTACHED = false;
function attachAll(){
  if (ATTACHED) return;
  ATTACHED = true;
  patchTopicCompleteRecursion();
  patchEnterClassroom();
  patchParentHub();
  
  // ═══════════════════════════════════════════════════════════════
  // DEMO MODE: Skip auth gates entirely when Firebase is disabled.
  // Users can browse the full app without signing in.
  // ═══════════════════════════════════════════════════════════════
  if (window.LT_FIREBASE_CONFIG) {
    patchRoleGating();
    patchArenaGate();
    patchSignedInRedirects();
  }
  
  patchArenaLeaderboard();
}

// ────────────────────────────────────────────────────────────────
// 0. Fix recordTopicComplete recursion bug + bump topicsCompleted
//    when a quiz is finished (acts as the "topic done" signal)
// ────────────────────────────────────────────────────────────────
function patchTopicCompleteRecursion(){
  if (typeof window.recordTopicComplete === 'function'){
    window.recordTopicComplete = function(subjName, topicTitle, xpEarned){
      try {
        var sp = window._sessionProgress; if (!sp) return;
        xpEarned = xpEarned || 10;
        sp.xp = (sp.xp||0) + xpEarned;
        sp.topicsCompleted = (sp.topicsCompleted||0) + 1;
        sp._sessionTopics = (sp._sessionTopics||0) + 1;
        sp.topicsCompletedList = sp.topicsCompletedList || [];
        sp.topicsCompletedList.push({
          subj: subjName||'', topic: topicTitle||'',
          date: new Date().toISOString(), xp: xpEarned
        });
        if (sp.topicsCompletedList.length > 200)
          sp.topicsCompletedList.splice(0, 50);
        try { window.xp = sp.xp; window.topicsCompleted = sp.topicsCompleted; } catch(e){}
        try { if (typeof window._checkStreak === 'function') window._checkStreak(); } catch(e){}
        try { if (typeof window._renderProgressBadges === 'function') window._renderProgressBadges(); } catch(e){}
        try { if (typeof window.saveProgress === 'function') window.saveProgress(); } catch(e){}
        try { if (typeof window._showXpToast === 'function') window._showXpToast('+' + xpEarned + ' XP — ' + (topicTitle||'topic done!')); } catch(e){}
      } catch(e){ console.warn('recordTopicComplete patch failed', e); }
    };
  }
  if (typeof window.recordQuizResult === 'function'){
    var origQuiz = window.recordQuizResult;
    window.recordQuizResult = function(subjName, topicTitle, correct, total){
      origQuiz.apply(this, arguments);
      try {
        var sp = window._sessionProgress; if (!sp) return;
        if (correct >= 1 && correct >= Math.ceil(total*0.5)){
          sp.topicsCompleted = (sp.topicsCompleted||0) + 1;
          sp.topicsCompletedList = sp.topicsCompletedList || [];
          sp.topicsCompletedList.push({
            subj: subjName||'', topic: topicTitle||'',
            date: new Date().toISOString(), xp: 0
          });
          if (sp.topicsCompletedList.length > 200) sp.topicsCompletedList.splice(0, 50);
          try { window.topicsCompleted = sp.topicsCompleted; } catch(e){}
          try { if (typeof window._renderProgressBadges === 'function') window._renderProgressBadges(); } catch(e){}
          try { if (typeof window.saveProgress === 'function') window.saveProgress(); } catch(e){}
        }
      } catch(e){}
    };
  }
}

// ────────────────────────────────────────────────────────────────
// 1. enterCL() — if signed-in student, prefer profile data
// ────────────────────────────────────────────────────────────────
function patchEnterClassroom(){
  var orig = window.enterCL;
  if (!orig) return;
  window.enterCL = function(){
    if (window.LTAuth && window.LTAuth.isSignedIn() && window._LT_LAST_PROFILE){
      var p = window._LT_LAST_PROFILE;
      try {
        var nameInput = document.getElementById('studentName');
        if (nameInput && !nameInput.value.trim() && p.name) nameInput.value = p.name;
        if (p.section) window.chosenSection = p.section;
        if (p.classLevel) window.chosenClass = p.classLevel;
        if (p.stream) window.chosenStream = p.stream;
      } catch(e){}
    }
    return orig.apply(this, arguments);
  };
}

// ────────────────────────────────────────────────────────────────
// 2. Parent Hub — link a real student by email + REAL dashboard
// ────────────────────────────────────────────────────────────────
function patchParentHub(){
  var origRender = window.phRenderProgress;
  if (origRender){
    window.phRenderProgress = async function(){
      origRender.apply(this, arguments);
      injectLinkPanel();
      await replaceActivityWithRealData();
    };
  }
  var origDash = window.phRenderDashboard;
  if (origDash){
    window.phRenderDashboard = async function(){
      origDash.apply(this, arguments);
      await renderRealDashboardOverlay();
    };
  }
  setTimeout(function(){
    var active = document.querySelector('.ph-tab.active');
    if (!active) return;
    if (active.dataset.tab === 'progress' && window.phRenderProgress){
      try { window.phRenderProgress(); } catch(e){}
    }
    if (active.dataset.tab === 'dashboard' && window.phRenderDashboard){
      try { window.phRenderDashboard(); } catch(e){}
    }
  }, 200);
}

function injectLinkPanel(){
  var content = document.getElementById('phContent');
  if (!content) return;
  var firstCard = content.querySelector('.ph-card');
  if (!firstCard) return;
  if (firstCard.querySelector('#phLinkPanel')) return;

  var panel = document.createElement('div');
  panel.id = 'phLinkPanel';
  panel.style.cssText = 'background:linear-gradient(135deg,rgba(37,99,235,.15),rgba(37,99,235,.05));border:1px solid rgba(37,99,235,.3);border-radius:12px;padding:18px;margin-bottom:18px;';
  panel.innerHTML =
    '<div style="display:flex;align-items:center;gap:8px;font-weight:800;color:#93c5fd;font-size:.95rem;margin-bottom:6px;">🔗 Link your child\'s real account</div>' +
    '<div style="color:rgba(255,255,255,.7);font-size:.85rem;margin-bottom:12px;">Pull live progress, exam results and streaks from the student\'s real Lesson Teacher account. Ask your child for the email they used to sign up.</div>' +
    '<div id="phLinkAuthZone"></div>' +
    '<div id="phLinkForm" style="display:none;">' +
      '<div style="display:grid;grid-template-columns:1fr auto;gap:10px;">' +
        '<input id="phLinkEmail" class="ph-input" placeholder="child@example.com" type="email" autocomplete="off">' +
        '<button id="phLinkBtn" class="ph-btn">Link</button>' +
      '</div>' +
      '<div id="phLinkStatus" style="margin-top:8px;font-size:.82rem;color:rgba(255,255,255,.6);"></div>' +
    '</div>' +
    '<div id="phLinkedChildren" style="margin-top:14px;"></div>';
  var h3 = firstCard.querySelector('h3');
  if (h3 && h3.nextSibling) firstCard.insertBefore(panel, h3.nextSibling.nextSibling || null);
  else firstCard.insertBefore(panel, firstCard.firstChild);

  refreshLinkPanel();
  if (window.LTAuth && !window.__ltLinkPanelSubscribed){
    window.__ltLinkPanelSubscribed = true;
    window.LTAuth.onChange(refreshLinkPanelIfMounted);
  }
}

function refreshLinkPanelIfMounted(){
  if (document.getElementById('phLinkPanel')) refreshLinkPanel();
}

function refreshLinkPanel(){
  var authZone = document.getElementById('phLinkAuthZone');
  var form = document.getElementById('phLinkForm');
  var listWrap = document.getElementById('phLinkedChildren');
  if (!authZone || !form || !listWrap) return;

  if (!window.LTCloud || !window.LTCloud.ready){
    authZone.innerHTML = '<div style="padding:10px 12px;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.3);border-radius:8px;color:#fbbf24;font-size:.82rem;">⚠️ Cloud sync not configured. Set up Firebase to link real student accounts.</div>';
    form.style.display = 'none';
    listWrap.innerHTML = '';
    return;
  }
  if (!window.LTAuth || !window.LTAuth.isSignedIn()){
    authZone.innerHTML =
      '<div style="display:flex;flex-direction:column;gap:8px;">' +
        '<div style="color:rgba(255,255,255,.7);font-size:.85rem;">Please sign in as a parent to link your child.</div>' +
        '<button class="ph-btn" id="phLinkSignIn" style="align-self:flex-start;background:#2563eb;">Sign in / Create parent account</button>' +
      '</div>';
    form.style.display = 'none';
    listWrap.innerHTML = '';
    var b = document.getElementById('phLinkSignIn');
    if (b) b.onclick = function(){ window.LTAuthUI && window.LTAuthUI.open({ mode:'signup', role:'parent' }); };
    return;
  }
  authZone.innerHTML = '<div style="font-size:.82rem;color:rgba(110,231,183,.85);margin-bottom:8px;">✓ Signed in as ' + escapeHtml(window.LTAuth.user.email) + '</div>';
  form.style.display = 'block';

  var btn = document.getElementById('phLinkBtn');
  var emailIn = document.getElementById('phLinkEmail');
  var statusEl = document.getElementById('phLinkStatus');
  if (btn && !btn.__wired){
    btn.__wired = true;
    btn.onclick = async function(){
      var email = (emailIn.value || '').trim();
      if (!email){ statusEl.textContent = 'Enter your child\'s email.'; return; }
      btn.disabled = true; btn.textContent = 'Linking…';
      statusEl.textContent = '';
      try {
        var res = await window.LTCloud.linkChildByEmail(email);
        statusEl.style.color = '#6ee7b7';
        statusEl.textContent = '✓ Linked ' + (res.childName || email);
        emailIn.value = '';
        await renderLinkedChildren();
        await replaceActivityWithRealData();
      } catch(err){
        statusEl.style.color = '#fca5a5';
        statusEl.textContent = (err && err.message) || 'Could not link.';
      } finally {
        btn.disabled = false; btn.textContent = 'Link';
      }
    };
  }

  renderLinkedChildren();
}

async function renderLinkedChildren(){
  var listWrap = document.getElementById('phLinkedChildren');
  if (!listWrap) return;
  if (!window.LTAuth || !window.LTAuth.isSignedIn()) { listWrap.innerHTML = ''; return; }
  listWrap.innerHTML = '<div style="color:rgba(255,255,255,.5);font-size:.82rem;">Loading linked children…</div>';
  var rows = [];
  try { rows = await window.LTCloud.listLinkedChildren(); } catch(e){ rows = []; }
  if (!rows.length){ listWrap.innerHTML = ''; return; }

  var progresses = await Promise.all(rows.map(function(r){
    return window.LTCloud.fetchChildProgress(r.childUid).catch(function(){ return null; });
  }));

  var html = '<div style="font-weight:800;color:#93c5fd;font-size:.85rem;margin-bottom:8px;">🎓 Linked students</div>';
  rows.forEach(function(r, i){
    var p = progresses[i] || {};
    var xp = p.xp || 0;
    var streak = p.streak || 0;
    var topics = p.topicsCompleted || 0;
    var lastExam = (p.examResults && p.examResults.length) ? p.examResults[p.examResults.length-1] : null;
    html +=
      '<div data-child-uid="' + escapeHtml(r.childUid) + '" style="background:rgba(0,0,0,.25);border-radius:10px;padding:12px 14px;margin-bottom:8px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">' +
          '<div>' +
            '<div style="font-weight:800;color:#fff;">' + escapeHtml(r.childName || r.childEmail) + '</div>' +
            '<div style="font-size:.78rem;color:rgba(255,255,255,.55);">' + escapeHtml(r.childEmail) + '</div>' +
          '</div>' +
          '<button class="ph-link-unlink" data-uid="' + escapeHtml(r.childUid) + '" style="background:rgba(220,38,38,.15);border:1px solid rgba(220,38,38,.3);color:#fca5a5;padding:5px 10px;border-radius:7px;font-size:.75rem;font-weight:700;cursor:pointer;font-family:inherit;">Unlink</button>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px;">' +
          '<div style="text-align:center;padding:8px;background:rgba(251,191,36,.08);border-radius:8px;"><div style="font-weight:900;color:#fbbf24;font-size:1.05rem;">' + xp + '</div><div style="font-size:.7rem;color:rgba(255,255,255,.6);">XP</div></div>' +
          '<div style="text-align:center;padding:8px;background:rgba(16,185,129,.08);border-radius:8px;"><div style="font-weight:900;color:#10b981;font-size:1.05rem;">' + topics + '</div><div style="font-size:.7rem;color:rgba(255,255,255,.6);">Topics</div></div>' +
          '<div style="text-align:center;padding:8px;background:rgba(124,58,237,.08);border-radius:8px;"><div style="font-weight:900;color:#a78bfa;font-size:1.05rem;">' + streak + '</div><div style="font-size:.7rem;color:rgba(255,255,255,.6);">Streak</div></div>' +
        '</div>' +
        (lastExam
          ? '<div style="margin-top:8px;font-size:.78rem;color:rgba(255,255,255,.65);">Last exam: <b style="color:#fff;">' + escapeHtml(lastExam.subj || lastExam.subject || '') + '</b> — ' + escapeHtml(String(lastExam.score||'')) + (lastExam.grade ? ' (' + escapeHtml(lastExam.grade) + ')' : '') + '</div>'
          : '<div style="margin-top:8px;font-size:.78rem;color:rgba(255,255,255,.4);">No exams logged yet</div>'
        ) +
        '<button class="ph-view-report" data-uid="' + escapeHtml(r.childUid) + '" data-name="' + escapeHtml(r.childName || r.childEmail) + '" style="margin-top:10px;width:100%;background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:#fff;border:0;padding:9px;border-radius:8px;font-weight:800;font-size:.84rem;cursor:pointer;font-family:inherit;">📋 View full report →</button>' +
      '</div>';
  });
  listWrap.innerHTML = html;
  listWrap.querySelectorAll('.ph-link-unlink').forEach(function(btn){
    btn.onclick = async function(){
      if (!confirm('Unlink this student?')) return;
      try {
        await window.LTCloud.unlinkChild(btn.getAttribute('data-uid'));
        await renderLinkedChildren();
        await replaceActivityWithRealData();
      } catch(e){ alert('Could not unlink.'); }
    };
  });
  listWrap.querySelectorAll('.ph-view-report').forEach(function(btn){
    btn.onclick = function(){
      if (typeof window.openChildReport === 'function'){
        window.openChildReport({ uid: btn.getAttribute('data-uid'), name: btn.getAttribute('data-name') });
      }
    };
  });
}

async function replaceActivityWithRealData(){
  if (!window.LTAuth || !window.LTAuth.isSignedIn()) return;
  if (!window.LTCloud || !window.LTCloud.ready) return;
  var rows;
  try { rows = await window.LTCloud.listLinkedChildren(); } catch(e){ rows = []; }
  if (!rows || !rows.length) return;
  var child = rows[0];
  var prog;
  try { prog = await window.LTCloud.fetchChildProgress(child.childUid); } catch(e){ prog = null; }
  if (!prog) return;

  var content = document.getElementById('phContent');
  if (!content) return;
  var actCard = null;
  content.querySelectorAll('.ph-card').forEach(function(c){
    var h = c.querySelector('h3');
    if (h && /This Week/i.test(h.textContent)) actCard = c;
  });
  if (!actCard) return;

  var topics = prog.topicsCompletedList || [];
  var quizzes = prog.quizResults || [];
  var now = new Date();
  var startOfWeek = new Date(now); startOfWeek.setHours(0,0,0,0);
  var dow = (startOfWeek.getDay() + 6) % 7;
  startOfWeek.setDate(startOfWeek.getDate() - dow);

  var dayCounts = [0,0,0,0,0,0,0];
  var dayMinutes = [0,0,0,0,0,0,0];
  function bumpDay(dateIso, isQuiz){
    var d = new Date(dateIso); if (isNaN(+d)) return;
    var diff = Math.floor((d - startOfWeek) / 86400000);
    if (diff < 0 || diff > 6) return;
    dayCounts[diff] += 1;
    dayMinutes[diff] += isQuiz ? 4 : 8;
  }
  topics.forEach(function(t){ bumpDay(t.date, false); });
  quizzes.forEach(function(q){ bumpDay(q.date, true); });

  var maxCount = Math.max.apply(null, dayCounts);
  if (maxCount === 0) maxCount = 1;
  var totalMins = dayMinutes.reduce(function(a,b){ return a+b; }, 0);
  var totalHours = (totalMins/60).toFixed(1);
  var lessonsThisWeek = dayCounts.reduce(function(a,b){ return a+b; }, 0);
  var streak = prog.streak || 0;

  var days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  var chartHtml = '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:8px;margin-bottom:20px;">';
  for (var d = 0; d < 7; d++){
    var pct = Math.max(4, Math.round((dayCounts[d] / maxCount) * 100));
    chartHtml += '<div style="text-align:center;">' +
      '<div style="height:80px;background:linear-gradient(to top, #fbbf24, #f97316);border-radius:6px;position:relative;margin-bottom:6px;">' +
        '<div style="position:absolute;top:0;left:0;right:0;height:' + (100 - pct) + '%;background:rgba(10,22,40,.85);border-radius:6px 6px 0 0;"></div>' +
      '</div>' +
      '<div style="font-size:.7rem;color:rgba(255,255,255,.6);">' + days[d] + '</div>' +
      '<div style="font-size:.75rem;color:#fbbf24;font-weight:700;">' + dayMinutes[d] + 'm</div>' +
    '</div>';
  }
  chartHtml += '</div>';

  var statsHtml = '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">' +
    '<div style="text-align:center;padding:14px;background:rgba(251,191,36,.08);border-radius:12px;">' +
      '<div style="font-size:1.6rem;font-weight:900;color:#fbbf24;font-family:\'Bricolage Grotesque\',sans-serif;">' + totalHours + 'h</div>' +
      '<div style="font-size:.75rem;color:rgba(255,255,255,.6);margin-top:2px;">This week</div>' +
    '</div>' +
    '<div style="text-align:center;padding:14px;background:rgba(16,185,129,.08);border-radius:12px;">' +
      '<div style="font-size:1.6rem;font-weight:900;color:#10b981;font-family:\'Bricolage Grotesque\',sans-serif;">' + lessonsThisWeek + '</div>' +
      '<div style="font-size:.75rem;color:rgba(255,255,255,.6);margin-top:2px;">Lessons done</div>' +
    '</div>' +
    '<div style="text-align:center;padding:14px;background:rgba(124,58,237,.08);border-radius:12px;">' +
      '<div style="font-size:1.6rem;font-weight:900;color:#a78bfa;font-family:\'Bricolage Grotesque\',sans-serif;">' + streak + '</div>' +
      '<div style="font-size:.75rem;color:rgba(255,255,255,.6);margin-top:2px;">Day streak</div>' +
    '</div>' +
  '</div>';

  var noteHtml;
  if (lessonsThisWeek === 0){
    noteHtml = '<div style="margin-top:16px;padding:14px;background:rgba(245,158,11,.08);border-left:3px solid #f59e0b;border-radius:0 10px 10px 0;"><div style="font-size:.82rem;color:#fbbf24;font-weight:700;margin-bottom:4px;">⚠️ No activity this week</div><div style="font-size:.85rem;color:rgba(255,255,255,.8);">Encourage ' + escapeHtml(child.childName||'them') + ' to open a lesson today. Even 15 minutes builds the streak.</div></div>';
  } else if (lessonsThisWeek < 5){
    noteHtml = '<div style="margin-top:16px;padding:14px;background:rgba(59,130,246,.08);border-left:3px solid #3b82f6;border-radius:0 10px 10px 0;"><div style="font-size:.82rem;color:#93c5fd;font-weight:700;margin-bottom:4px;">📚 Building momentum</div><div style="font-size:.85rem;color:rgba(255,255,255,.8);">' + escapeHtml(child.childName||'They') + ' has done ' + lessonsThisWeek + ' lesson' + (lessonsThisWeek===1?'':'s') + ' this week. A daily 20-min session works well.</div></div>';
  } else {
    noteHtml = '<div style="margin-top:16px;padding:14px;background:rgba(16,185,129,.08);border-left:3px solid #10b981;border-radius:0 10px 10px 0;"><div style="font-size:.82rem;color:#6ee7b7;font-weight:700;margin-bottom:4px;">✓ On track</div><div style="font-size:.85rem;color:rgba(255,255,255,.8);">' + escapeHtml(child.childName||'Your child') + ' is studying consistently. Ask: "Which subject did you learn today?"</div></div>';
  }

  var h3 = actCard.querySelector('h3');
  if (!h3) return;
  while (h3.nextSibling) actCard.removeChild(h3.nextSibling);
  var wrap = document.createElement('div');
  wrap.innerHTML = chartHtml + statsHtml + noteHtml;
  while (wrap.firstChild) actCard.appendChild(wrap.firstChild);
}

async function renderRealDashboardOverlay(){
  if (!window.LTAuth || !window.LTAuth.isSignedIn()) return;
  if (!window.LTCloud || !window.LTCloud.ready) return;
  var rows;
  try { rows = await window.LTCloud.listLinkedChildren(); } catch(e){ rows = []; }
  if (!rows.length) return;

  var content = document.getElementById('phContent');
  if (!content) return;
  if (content.querySelector('#phRealSummary')) return;

  var progresses = await Promise.all(rows.map(function(r){
    return window.LTCloud.fetchChildProgress(r.childUid).catch(function(){ return null; });
  }));
  var totalXp = 0, totalTopics = 0, totalExams = 0, maxStreak = 0;
  var latestExam = null;
  progresses.forEach(function(p){
    if (!p) return;
    totalXp     += p.xp || 0;
    totalTopics += p.topicsCompleted || 0;
    totalExams  += (p.examResults||[]).length;
    if ((p.streak||0) > maxStreak) maxStreak = p.streak;
    var le = (p.examResults||[])[(p.examResults||[]).length-1];
    if (le && (!latestExam || (le.date||'') > (latestExam.date||''))) latestExam = le;
  });

  var card = document.createElement('div');
  card.id = 'phRealSummary';
  card.className = 'ph-card';
  card.style.cssText = 'background:linear-gradient(135deg,rgba(37,99,235,.18),rgba(124,58,237,.12));border:1px solid rgba(96,165,250,.3);margin-bottom:16px;';
  card.innerHTML =
    '<h3 style="display:flex;align-items:center;gap:8px;">📊 Live data — your linked students</h3>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-top:12px;">' +
      '<div style="text-align:center;padding:14px;background:rgba(0,0,0,.2);border-radius:12px;">' +
        '<div style="font-family:\'Bricolage Grotesque\',sans-serif;font-size:1.8rem;font-weight:900;color:#fbbf24;">' + totalXp + '</div>' +
        '<div style="font-size:.75rem;color:rgba(255,255,255,.6);">Total XP earned</div>' +
      '</div>' +
      '<div style="text-align:center;padding:14px;background:rgba(0,0,0,.2);border-radius:12px;">' +
        '<div style="font-family:\'Bricolage Grotesque\',sans-serif;font-size:1.8rem;font-weight:900;color:#10b981;">' + totalTopics + '</div>' +
        '<div style="font-size:.75rem;color:rgba(255,255,255,.6);">Topics completed</div>' +
      '</div>' +
      '<div style="text-align:center;padding:14px;background:rgba(0,0,0,.2);border-radius:12px;">' +
        '<div style="font-family:\'Bricolage Grotesque\',sans-serif;font-size:1.8rem;font-weight:900;color:#a78bfa;">' + totalExams + '</div>' +
        '<div style="font-size:.75rem;color:rgba(255,255,255,.6);">Mock exams taken</div>' +
      '</div>' +
      '<div style="text-align:center;padding:14px;background:rgba(0,0,0,.2);border-radius:12px;">' +
        '<div style="font-family:\'Bricolage Grotesque\',sans-serif;font-size:1.8rem;font-weight:900;color:#f97316;">' + maxStreak + '</div>' +
        '<div style="font-size:.75rem;color:rgba(255,255,255,.6);">Best day streak</div>' +
      '</div>' +
    '</div>' +
    (latestExam
      ? '<div style="margin-top:12px;padding:10px 14px;background:rgba(16,185,129,.1);border-radius:10px;font-size:.85rem;color:#6ee7b7;">📈 Latest exam: <b>' + escapeHtml(latestExam.subj||latestExam.subject||'') + '</b> — ' + escapeHtml(String(latestExam.score||'')) + (latestExam.grade ? ' (' + escapeHtml(latestExam.grade) + ')' : '') + '</div>'
      : '');
  content.insertBefore(card, content.firstChild);
}

// ────────────────────────────────────────────────────────────────
// 3. Hard sign-in gate — every feature page requires sign-in.
// ────────────────────────────────────────────────────────────────
// Pages that DON'T require sign-in:
var PUBLIC_PAGES = ['pg-landing'];
// Pages where a signed-in student can land but parents can't:
var STUDENT_ONLY = []; // none right now — parents can browse student pages
// Pages reserved for parents:
var PARENT_ONLY = ['pg-parent'];

function patchRoleGating(){
  var origGoTo = window.goTo;
  if (!origGoTo) {
    setTimeout(patchRoleGating, 250);
    return;
  }
  window.goTo = function(id){
    // ═══════════════════════════════════════════════════════════════
    // DEMO MODE: If Firebase is not configured, skip ALL auth gating.
    // App runs in localStorage-only mode for full demonstration.
    // ═══════════════════════════════════════════════════════════════
    if (!window.LT_FIREBASE_CONFIG) {
      return origGoTo.apply(this, arguments);
    }
    
    var signedIn = !!(window.LTAuth && window.LTAuth.isSignedIn && window.LTAuth.isSignedIn());
    var role = (window._LT_LAST_PROFILE && window._LT_LAST_PROFILE.role) || null;
    var profile = window._LT_LAST_PROFILE || null;

    // 1. Public pages — always allowed.
    if (PUBLIC_PAGES.indexOf(id) !== -1) {
      return origGoTo.apply(this, arguments);
    }

    // 2. Not signed in → bounce to landing + open sign-in modal.
    if (!signedIn) {
      // Remember where they were trying to go, so post-auth can route them there.
      try { if (window.LTNav && window.LTNav.setIntent) window.LTNav.setIntent(id); } catch(e){}
      try { showSignInPrompt(id); } catch(e){ console.warn(e); }
      return origGoTo.call(this, 'pg-landing');
    }

    // 3. Signed in but no profile yet (Firebase still hydrating) → self-heal.
    if (!profile) {
      var pending = id;
      var resumed = false;
      var resume = function(){
        if (resumed) return;
        resumed = true;
        try { window.removeEventListener('lt-cloud-hydrated', resume); } catch(e){}
        setTimeout(function(){ window.goTo(pending); }, 30);
      };
      // a) listen in case hydration is still in flight
      window.addEventListener('lt-cloud-hydrated', resume);
      // b) try loading the profile right now
      try {
        if (window.LTCloud && window.LTCloud.loadProfile){
          window.LTCloud.loadProfile().then(function(p){
            if (p){ window._LT_LAST_PROFILE = p; resume(); }
          }).catch(function(){});
        }
      } catch(e){}
      // c) polling fallback in case the event already fired before we listened
      var tries = 0;
      var poll = setInterval(function(){
        tries++;
        if (window._LT_LAST_PROFILE){ clearInterval(poll); resume(); }
        else if (tries > 30){ clearInterval(poll); resume(); /* give up waiting */ }
      }, 100);
      return;
    }

    // 4. Block parents from student-only pages.
    if (STUDENT_ONLY.indexOf(id) !== -1 && role !== 'student') {
      showRoleToast('That section is for students.');
      return origGoTo.call(this, 'pg-landing');
    }

    // 5. Block students from parent-only pages.
    if (PARENT_ONLY.indexOf(id) !== -1 && role === 'student') {
      showRoleToast('The Parent Hub is for parents only.');
      return origGoTo.call(this, 'pg-landing');
    }

    // 6. Signed-in students hitting the level-picker → straight to classroom.
    if (id === 'pg-beta' && role === 'student' && profile.section && profile.classLevel) {
      try {
        window.studentName   = profile.name || 'Student';
        window.chosenSection = profile.section;
        window.chosenClass   = profile.classLevel;
        if (profile.stream) window.chosenStream = profile.stream;
        var inp = document.getElementById('studentName');
        if (inp) inp.value = profile.name || '';
        if (profile.section === 'kids') {
          origGoTo.call(this, 'pg-kids');
          try {
            var kn = document.getElementById('kName');
            if (kn) kn.textContent = profile.name || 'Student';
            if (typeof window.kInit === 'function') window.kInit();
          } catch(e){}
        } else {
          if (typeof window.enterCL === 'function') window.enterCL();
          else origGoTo.call(this, 'pg-classroom');
        }
      } catch(e){
        console.warn('classroom redirect failed', e);
        return origGoTo.apply(this, arguments);
      }
      return;
    }

    // 7. Signed-in parents hitting the level-picker → Parent Hub.
    if (id === 'pg-beta' && role === 'parent') {
      return origGoTo.call(this, 'pg-parent');
    }

    // 8. Default: pass through.
    return origGoTo.apply(this, arguments);
  };

  // Also gate Live Arena (has its own entry, not goTo).
  var origOpenArena = window.openArena;
  if (typeof origOpenArena === 'function' && !origOpenArena.__gateHooked) {
    window.openArena = function(){
      // DEMO MODE: skip auth gate when Firebase disabled
      if (!window.LT_FIREBASE_CONFIG) {
        return origOpenArena.apply(this, arguments);
      }
      var signedIn = !!(window.LTAuth && window.LTAuth.isSignedIn && window.LTAuth.isSignedIn());
      if (!signedIn) {
        showSignInPrompt('Live Arena');
        return;
      }
      return origOpenArena.apply(this, arguments);
    };
    window.openArena.__gateHooked = true;
  } else if (!origOpenArena) {
    // Arena script loads later — try again
    setTimeout(function(){
      var fn = window.openArena;
      if (typeof fn === 'function' && !fn.__gateHooked) {
        var orig = fn;
        window.openArena = function(){
          // DEMO MODE: skip auth gate when Firebase disabled
          if (!window.LT_FIREBASE_CONFIG) {
            return orig.apply(this, arguments);
          }
          var signedIn = !!(window.LTAuth && window.LTAuth.isSignedIn && window.LTAuth.isSignedIn());
          if (!signedIn) { showSignInPrompt('Live Arena'); return; }
          return orig.apply(this, arguments);
        };
        window.openArena.__gateHooked = true;
      }
    }, 1500);
  }
}

function showSignInPrompt(targetPage){
  // DEMO MODE: Don't show sign-in prompts when Firebase is disabled
  if (!window.LT_FIREBASE_CONFIG) {
    return;
  }
  // Open the sign-in modal if available.
  if (window.LTAuthUI && typeof window.LTAuthUI.open === 'function') {
    try {
      showRoleToast('Please sign in to continue.');
      setTimeout(function(){ window.LTAuthUI.open({ mode: 'signin' }); }, 50);
      return;
    } catch(e){}
  }
  // Fallback: just toast.
  showRoleToast('Please sign in to continue.');
}

function showRoleToast(msg){
  var t = document.createElement('div');
  t.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);background:#0f1824;color:#fff;border:1px solid rgba(245,158,11,.4);border-radius:12px;padding:12px 18px;font-size:.9rem;z-index:2147483647;box-shadow:0 12px 40px rgba(0,0,0,.5);max-width:90%;text-align:center;';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(function(){ t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, 4500);
  setTimeout(function(){ t.remove(); }, 5000);
}

// ────────────────────────────────────────────────────────────────
// 4. Arena (live games) gate — weekends OR earned fun-time OR parent
// ────────────────────────────────────────────────────────────────
function patchArenaGate(){
  if (!window.openArena){
    setTimeout(patchArenaGate, 500);
    return;
  }
  var orig = window.openArena;
  window.openArena = function(){
    if (canPlayArena()){
      return orig.apply(this, arguments);
    }
    showArenaGateModal();
  };
}

function canPlayArena(){
  if (isDemoMode()) return true;
  var role = (window._LT_LAST_PROFILE && window._LT_LAST_PROFILE.role) || null;
  if (role === 'parent') return true;
  var day = new Date().getDay();
  if (day === 0 || day === 6) return true;
  try {
    var sp = window._sessionProgress; if (!sp) return false;
    var today = new Date().toISOString().slice(0,10);
    var topicsToday = (sp.topicsCompletedList||[]).filter(function(t){
      return (t.date||'').slice(0,10) === today;
    }).length;
    if (topicsToday >= 3) return true;
    var goodQuizzes = (sp.quizResults||[]).filter(function(q){
      return (q.date||'').slice(0,10) === today && (q.total>0) && (q.correct/q.total) >= 0.7;
    });
    if (goodQuizzes.length >= 1) return true;
  } catch(e){}
  return false;
}

function showArenaGateModal(){
  var existing = document.querySelector('.lt-gate-bd');
  if (existing) existing.remove();
  var sp = window._sessionProgress || {};
  var today = new Date().toISOString().slice(0,10);
  var topicsToday = (sp.topicsCompletedList||[]).filter(function(t){
    return (t.date||'').slice(0,10) === today;
  }).length;

  var bd = document.createElement('div');
  bd.className = 'lt-gate-bd';
  bd.style.cssText = 'position:fixed;inset:0;background:rgba(8,14,26,.88);backdrop-filter:blur(8px);z-index:2147483640;display:flex;align-items:center;justify-content:center;padding:20px;';
  var card = document.createElement('div');
  card.style.cssText = 'width:100%;max-width:440px;background:#0f1824;color:#f0f4ff;border:1px solid rgba(255,255,255,.1);border-radius:18px;padding:28px 24px;font-family:\'Plus Jakarta Sans\',system-ui,sans-serif;text-align:center;box-shadow:0 30px 80px rgba(0,0,0,.6);';
  card.innerHTML =
    '<div style="font-size:3rem;margin-bottom:8px;">🎮</div>' +
    '<h2 style="font-family:\'Bricolage Grotesque\',sans-serif;font-size:1.4rem;font-weight:800;margin:0 0 8px;color:#fff;">Game time is earned</h2>' +
    '<p style="color:rgba(255,255,255,.75);font-size:.92rem;margin:0 0 18px;line-height:1.5;">Live Arena opens on <b style="color:#fbbf24;">weekends</b> — or anytime you earn fun-time today by:</p>' +
    '<ul style="text-align:left;list-style:none;padding:0;margin:0 0 20px;">' +
      '<li style="padding:8px 12px;background:rgba(0,0,0,.25);border-radius:8px;margin-bottom:6px;font-size:.88rem;">' +
        (topicsToday >= 3 ? '<span style="color:#10b981;">✓</span>' : '<span style="color:rgba(255,255,255,.4);">○</span>') +
        ' Complete 3 topics today  <span style="float:right;color:rgba(255,255,255,.5);">' + topicsToday + ' / 3</span></li>' +
      '<li style="padding:8px 12px;background:rgba(0,0,0,.25);border-radius:8px;margin-bottom:6px;font-size:.88rem;">' +
        '<span style="color:rgba(255,255,255,.4);">○</span>' +
        ' Score 70%+ on a quiz today</li>' +
    '</ul>' +
    '<div style="display:flex;flex-direction:column;gap:8px;">' +
      '<button id="ltGateStudy" style="padding:12px;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;border:0;border-radius:9px;font-weight:800;font-size:.95rem;cursor:pointer;font-family:inherit;">Open a lesson now →</button>' +
      '<button id="ltGateClose" style="padding:10px;background:rgba(255,255,255,.06);color:#e2e8f0;border:1px solid rgba(255,255,255,.1);border-radius:9px;font-weight:600;font-size:.85rem;cursor:pointer;font-family:inherit;">Maybe later</button>' +
    '</div>';
  bd.appendChild(card);
  document.body.appendChild(bd);
  bd.addEventListener('click', function(e){ if (e.target === bd) bd.remove(); });
  card.querySelector('#ltGateStudy').onclick = function(){
    bd.remove();
    if (typeof window.goTo === 'function') window.goTo('pg-classroom');
  };
  card.querySelector('#ltGateClose').onclick = function(){ bd.remove(); };
}

// ────────────────────────────────────────────────────────────────
// 5. Arena leaderboard — fetch from cloud when available
// ────────────────────────────────────────────────────────────────
function patchArenaLeaderboard(){
  if (!window.ArenaDB) {
    setTimeout(patchArenaLeaderboard, 500);
    return;
  }
  var origTop = window.ArenaDB.topLeaders;
  window.ArenaDB.topLeadersAsync = async function(classGroup, scope, lim){
    if (window.LTAuth && window.LTAuth.isSignedIn() && window.LTCloud && window.LTCloud.ready){
      try {
        var rows = await window.LTCloud.topLeaders(classGroup, scope, lim);
        if (rows && rows.length) return rows;
      } catch(e){}
    }
    return origTop.call(window.ArenaDB, classGroup, scope, lim);
  };
}

// ────────────────────────────────────────────────────────────────
// 6. Smart redirect after sign-up
// ────────────────────────────────────────────────────────────────
function patchSignedInRedirects(){
  if (!window.LTAuth) {
    setTimeout(patchSignedInRedirects, 500);
    return;
  }
  var lastUid = null;
  window.LTAuth.onChange(function(user){
    if (!user) { lastUid = null; return; }
    if (user.uid === lastUid) return;
    lastUid = user.uid;
    var attempts = 0;
    var iv = setInterval(function(){
      attempts++;
      if (attempts > 25) { clearInterval(iv); return; }
      var p = window._LT_LAST_PROFILE;
      if (!p) return;
      clearInterval(iv);
      var activePage = document.querySelector('.page.active');
      var activeId = activePage ? activePage.id : '';
      if (activeId !== 'pg-landing' && activeId !== 'pg-beta') return;

      if (p.role === 'parent'){
        if (typeof window.goTo === 'function') window.goTo('pg-parent');
      } else if (p.role === 'student' && (!p.section || !p.classLevel || p.needsOnboarding)){
        // Google sign-up — student didn't pick level/class yet
        showOnboardingModal();
      } else if (p.role === 'student' && p.section && p.classLevel){
        try {
          window.studentName  = p.name || 'Student';
          window.chosenSection = p.section;
          window.chosenClass   = p.classLevel;
          if (p.stream) window.chosenStream = p.stream;
          var inp = document.getElementById('studentName');
          if (inp) inp.value = p.name || '';
          if (p.section === 'kids'){
            if (typeof window.goTo === 'function') window.goTo('pg-kids');
            try {
              var kn = document.getElementById('kName');
              if (kn) kn.textContent = p.name || 'Student';
              if (typeof window.kInit === 'function') window.kInit();
            } catch(e){}
          } else {
            if (typeof window.enterCL === 'function') window.enterCL();
          }
        } catch(e){ console.warn('auto-route failed', e); }
      }
    }, 200);
  });
}

function refreshAccountChip(){
  if (window.LTAuthUI && typeof window.LTAuthUI.refreshChip === 'function'){
    try { window.LTAuthUI.refreshChip(); } catch(e){}
  }
}

// ────────────────────────────────────────────────────────────────
// Onboarding modal — for users who signed up via Google and still
// need to pick their level/class.
// ────────────────────────────────────────────────────────────────
var ONBOARDING_OPEN = false;
function showOnboardingModal(){
  if (ONBOARDING_OPEN) return;
  ONBOARDING_OPEN = true;

  var bd = document.createElement('div');
  bd.className = 'lt-onboard-bd';
  bd.style.cssText = 'position:fixed;inset:0;background:rgba(8,14,26,.92);backdrop-filter:blur(8px);z-index:2147483640;display:flex;align-items:center;justify-content:center;padding:20px;';
  var card = document.createElement('div');
  card.style.cssText = 'width:100%;max-width:440px;background:#0f1824;color:#f0f4ff;border:1px solid rgba(255,255,255,.1);border-radius:18px;padding:28px 24px;font-family:\'Plus Jakarta Sans\',system-ui,sans-serif;box-shadow:0 30px 80px rgba(0,0,0,.6);max-height:92vh;overflow-y:auto;';

  var p = window._LT_LAST_PROFILE || {};
  card.innerHTML =
    '<h2 style="font-family:\'Bricolage Grotesque\',sans-serif;font-size:1.4rem;font-weight:800;margin:0 0 4px;color:#fff;">One more step, ' + escapeHtml((p.name||'').split(' ')[0] || 'friend') + '!</h2>' +
    '<p style="color:rgba(255,255,255,.65);font-size:.9rem;margin:0 0 18px;">Tell us your level and class so we can show you the right syllabus.</p>' +

    '<div style="margin-bottom:12px;"><label style="display:block;font-size:.78rem;font-weight:700;color:rgba(255,255,255,.7);margin-bottom:5px;letter-spacing:.04em;text-transform:uppercase;">Level</label>' +
    '<select id="ltOnSection" style="width:100%;padding:11px 14px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#fff;border-radius:9px;font-size:.95rem;font-family:inherit;outline:none;">' +
      '<option value="">Choose your level</option>' +
      '<option value="kids">Kids Zone (Ages 4–10)</option>' +
      '<option value="primary">Basic 1–6</option>' +
      '<option value="jss">Junior Secondary (JHS 1–3)</option>' +
      '<option value="sss">Senior Secondary (SS 1–3)</option>' +
    '</select></div>' +

    '<div style="margin-bottom:12px;"><label style="display:block;font-size:.78rem;font-weight:700;color:rgba(255,255,255,.7);margin-bottom:5px;letter-spacing:.04em;text-transform:uppercase;">Class</label>' +
    '<select id="ltOnClass" style="width:100%;padding:11px 14px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#fff;border-radius:9px;font-size:.95rem;font-family:inherit;outline:none;"><option value="">Pick level first</option></select></div>' +

    '<div id="ltOnStreamWrap" style="display:none;margin-bottom:12px;"><label style="display:block;font-size:.78rem;font-weight:700;color:rgba(255,255,255,.7);margin-bottom:5px;letter-spacing:.04em;text-transform:uppercase;">Stream (SS only)</label>' +
    '<select id="ltOnStream" style="width:100%;padding:11px 14px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#fff;border-radius:9px;font-size:.95rem;font-family:inherit;outline:none;">' +
      '<option value="science">Science</option>' +
      '<option value="arts">Arts &amp; Humanities</option>' +
      '<option value="commercial">Commercial</option>' +
      '<option value="technical">Technical / Vocational</option>' +
    '</select></div>' +

    '<div id="ltOnError" style="color:#fca5a5;font-size:.82rem;margin-bottom:8px;"></div>' +
    '<button id="ltOnSubmit" style="width:100%;padding:13px;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;border:0;border-radius:9px;font-weight:800;font-size:.98rem;cursor:pointer;font-family:inherit;">Continue →</button>';

  bd.appendChild(card);
  document.body.appendChild(bd);

  var classOpts = {
    kids:    [['early','Ages 4–6'],['upper','Ages 7–10']],
    primary: [['P1','Basic 1'],['P2','Basic 2'],['P3','Basic 3'],['P4','Basic 4'],['P5','Basic 5'],['P6','Basic 6']],
    jss:     [['JHS 1','JHS 1'],['JHS 2','JHS 2'],['JHS 3','JHS 3']],
    sss:     [['SHS 1','SS 1'],['SHS 2','SS 2'],['SHS 3','SS 3']]
  };
  var sectionEl = card.querySelector('#ltOnSection');
  var classEl = card.querySelector('#ltOnClass');
  var streamWrap = card.querySelector('#ltOnStreamWrap');
  var errEl = card.querySelector('#ltOnError');
  sectionEl.addEventListener('change', function(){
    var sec = sectionEl.value;
    if (!sec){ classEl.innerHTML = '<option value="">Pick level first</option>'; streamWrap.style.display='none'; return; }
    classEl.innerHTML = classOpts[sec].map(function(o){ return '<option value="'+o[0]+'">'+o[1]+'</option>';}).join('');
    streamWrap.style.display = (sec === 'sss') ? 'block' : 'none';
  });
  card.querySelector('#ltOnSubmit').onclick = async function(){
    errEl.textContent = '';
    var section = sectionEl.value;
    var classLevel = classEl.value;
    if (!section){ errEl.textContent = 'Please pick your level.'; return; }
    if (!classLevel){ errEl.textContent = 'Please pick your class.'; return; }
    var stream = (section === 'sss') ? card.querySelector('#ltOnStream').value : '';
    try {
      await window.LTCloud.saveProfile({
        section: section,
        classLevel: classLevel,
        stream: stream,
        needsOnboarding: false
      });
      // Update cached profile
      if (window._LT_LAST_PROFILE){
        window._LT_LAST_PROFILE.section    = section;
        window._LT_LAST_PROFILE.classLevel = classLevel;
        window._LT_LAST_PROFILE.stream     = stream;
        window._LT_LAST_PROFILE.needsOnboarding = false;
      }
      bd.remove();
      ONBOARDING_OPEN = false;
      // Now do the proper redirect
      try {
        window.studentName = (window._LT_LAST_PROFILE||{}).name || 'Student';
        window.chosenSection = section;
        window.chosenClass = classLevel;
        if (stream) window.chosenStream = stream;
        var inp = document.getElementById('studentName');
        if (inp) inp.value = window.studentName;
        if (section === 'kids'){
          if (typeof window.goTo === 'function') window.goTo('pg-kids');
          try {
            var kn = document.getElementById('kName');
            if (kn) kn.textContent = window.studentName;
            if (typeof window.kInit === 'function') window.kInit();
          } catch(e){}
        } else {
          if (typeof window.enterCL === 'function') window.enterCL();
        }
      } catch(e){ console.warn(e); }
    } catch(err){
      errEl.textContent = (err && err.message) || 'Could not save. Try again.';
    }
  };
}

function escapeHtml(s){
  return String(s||'').replace(/[&<>"']/g, function(c){
    return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
  });
}

})();
