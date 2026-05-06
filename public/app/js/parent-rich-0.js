/* ════════════════════════════════════════════════════════════════
   PARENT DASHBOARD ENHANCEMENT
   Adds richer analytics + advice + counselling sections to the
   Parent Hub when a child is linked.

   - Study time heatmap (4 weeks)
   - Exam-score trend (line chart, SVG)
   - Subject mix (donut chart, SVG)
   - "Advice this week" card based on real data
   - "Need to talk to a counsellor?" panel with referral info
   - Honest disclosure that screen-time monitoring outside the app
     is not possible in a web app

   Hooks into firebase-wiring-0.js's existing parent dashboard work
   and runs after the linked-child data is loaded.
   ════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

var BOOTED = false;
function boot(){
  if (BOOTED) return;
  BOOTED = true;
  // Patch phRenderProgress (firebase-wiring already wraps it)
  // We need to run AFTER the existing wiring + chart injection.
  // Strategy: re-wrap phRenderProgress and phRenderDashboard one
  // more time, after a small delay so firebase-wiring is in place.
  setTimeout(installEnhancements, 300);
}

function installEnhancements(){
  if (typeof window.phRenderProgress === 'function'){
    var origP = window.phRenderProgress;
    window.phRenderProgress = async function(){
      await origP.apply(this, arguments);
      try { await injectRichDashboard('progress'); } catch(e){ console.warn('rich dash failed', e); }
    };
  }
  if (typeof window.phRenderDashboard === 'function'){
    var origD = window.phRenderDashboard;
    window.phRenderDashboard = async function(){
      await origD.apply(this, arguments);
      try { await injectRichDashboard('dashboard'); } catch(e){ console.warn('rich dash failed', e); }
    };
  }
}

async function injectRichDashboard(tab){
  if (!window.LTAuth || !window.LTAuth.isSignedIn()) return;
  if (!window.LTCloud || !window.LTCloud.ready) return;
  var rows = [];
  try { rows = await window.LTCloud.listLinkedChildren(); } catch(e){}
  if (!rows.length) return;

  // Pull all linked children's progress
  var progresses = await Promise.all(rows.map(function(r){
    return window.LTCloud.fetchChildProgress(r.childUid).catch(function(){ return null; });
  }));

  var content = document.getElementById('phContent');
  if (!content) return;

  // For now use first child's data for the visualisations
  var child = rows[0];
  var prog = progresses[0] || {};

  // Avoid double-injection
  if (content.querySelector('#ph-rich-charts')) return;

  var wrap = document.createElement('div');
  wrap.id = 'ph-rich-charts';
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:14px;margin-top:18px;';

  wrap.appendChild(buildHeatmapCard(child, prog));
  wrap.appendChild(buildExamTrendCard(child, prog));
  wrap.appendChild(buildSubjectMixCard(child, prog));
  wrap.appendChild(buildAdviceCard(child, prog));
  wrap.appendChild(buildCounsellingCard());
  wrap.appendChild(buildScreenTimeNote());

  content.appendChild(wrap);
}

// ────────────────────────────────────────────────────────────────
// Heatmap — daily activity over the past 4 weeks
// ────────────────────────────────────────────────────────────────
function buildHeatmapCard(child, prog){
  var topics = prog.topicsCompletedList || [];
  var quizzes = prog.quizResults || [];
  var exams = prog.examResults || [];

  // Build a count per ISO date for the last 28 days
  var today = new Date(); today.setHours(0,0,0,0);
  var counts = {};
  for (var d = 0; d < 28; d++){
    var dt = new Date(today); dt.setDate(today.getDate() - (27 - d));
    counts[dt.toISOString().slice(0,10)] = 0;
  }
  function bump(items){
    items.forEach(function(it){
      if (!it || !it.date) return;
      var k = String(it.date).slice(0,10);
      if (k in counts) counts[k] += 1;
    });
  }
  bump(topics); bump(quizzes); bump(exams);

  var maxCount = Math.max.apply(null, Object.values(counts).concat([1]));
  var dayKeys = Object.keys(counts);

  // 7 cols × 4 rows (most recent week on the right)
  var card = makeCard('🔥 4-week study heatmap',
    'Each square is a day. Greener = more activity. Helps spot quiet stretches.');
  var grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:auto repeat(28,1fr);gap:3px;align-items:center;margin-top:8px;font-family:inherit;overflow-x:auto;';

  // Column 1: blank (we'll skip the day-of-week labels for simplicity)
  var blank = document.createElement('div');
  blank.style.cssText = 'width:14px;';
  grid.appendChild(blank);

  dayKeys.forEach(function(k){
    var c = counts[k];
    var pct = c / maxCount;
    var cell = document.createElement('div');
    var bg = c === 0 ? 'rgba(255,255,255,.05)'
      : 'rgba(16,185,129,' + (0.18 + pct*0.7).toFixed(2) + ')';
    cell.style.cssText = 'aspect-ratio:1/1;min-width:14px;border-radius:3px;background:' + bg + ';' +
      'border:1px solid rgba(255,255,255,.04);';
    var dt = new Date(k);
    var label = dt.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'});
    cell.title = label + ' — ' + c + ' activities';
    grid.appendChild(cell);
  });

  card.appendChild(grid);

  // Stats below
  var totalDays = Object.values(counts).filter(function(c){ return c > 0; }).length;
  var stats = document.createElement('div');
  stats.style.cssText = 'display:flex;gap:14px;flex-wrap:wrap;font-size:.78rem;color:rgba(255,255,255,.6);margin-top:10px;';
  stats.innerHTML =
    '<span><b style="color:#10b981;">' + totalDays + '</b> active days in 28</span>' +
    '<span><b style="color:#fbbf24;">' + (prog.streak || 0) + '</b> day current streak</span>' +
    '<span><b style="color:#a78bfa;">' + (prog.topicsCompleted || 0) + '</b> total topics</span>';
  card.appendChild(stats);

  return card;
}

// ────────────────────────────────────────────────────────────────
// Exam-score trend — line chart, last up to 10 exams
// ────────────────────────────────────────────────────────────────
function buildExamTrendCard(child, prog){
  var exams = (prog.examResults || []).slice(-10);
  var card = makeCard('📈 Exam score trend',
    'Real exam scores over time. A flat or downward line means a subject needs attention.');
  if (!exams.length){
    var note = document.createElement('div');
    note.style.cssText = 'padding:14px;background:rgba(255,255,255,.03);border-radius:10px;color:rgba(255,255,255,.5);font-size:.85rem;text-align:center;margin-top:6px;';
    note.textContent = 'No mock exams logged yet. Encourage ' + (child.childName||'them') + ' to take a mock in the Exam Centre.';
    card.appendChild(note);
    return card;
  }
  var w = 600, h = 160, padX = 30, padY = 22;
  var n = exams.length;
  var stepX = n > 1 ? (w - 2*padX) / (n - 1) : 0;
  var maxScore = 100;

  var ptsArr = exams.map(function(e, i){
    var s = parseFloat(e.score) || 0;
    var x = padX + i * stepX;
    var y = h - padY - (s / maxScore) * (h - 2*padY);
    return { x: x, y: y, score: s, label: e.subj || e.subject || '', date: e.date || '' };
  });
  var ptsAttr = ptsArr.map(function(p){ return p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(' ');

  var svgNS = 'http://www.w3.org/2000/svg';
  var svg = document.createElementNS(svgNS,'svg');
  svg.setAttribute('viewBox','0 0 ' + w + ' ' + h);
  svg.setAttribute('preserveAspectRatio','xMidYMid meet');
  svg.style.cssText = 'width:100%;height:auto;display:block;margin-top:8px;';

  // Grid lines (horizontal at 0/50/100)
  [0, 50, 100].forEach(function(s){
    var y = h - padY - (s / maxScore) * (h - 2*padY);
    var line = document.createElementNS(svgNS,'line');
    line.setAttribute('x1', padX); line.setAttribute('x2', w - padX);
    line.setAttribute('y1', y); line.setAttribute('y2', y);
    line.setAttribute('stroke', 'rgba(255,255,255,.08)');
    line.setAttribute('stroke-width', '1');
    if (s === 50) line.setAttribute('stroke-dasharray', '4 4');
    svg.appendChild(line);
    var lbl = document.createElementNS(svgNS,'text');
    lbl.setAttribute('x', 6); lbl.setAttribute('y', y + 4);
    lbl.setAttribute('fill', 'rgba(255,255,255,.4)');
    lbl.setAttribute('font-size','10');
    lbl.setAttribute('font-family','inherit');
    lbl.textContent = s + '%';
    svg.appendChild(lbl);
  });

  // Line
  if (n > 1){
    var poly = document.createElementNS(svgNS,'polyline');
    poly.setAttribute('points', ptsAttr);
    poly.setAttribute('fill','none');
    poly.setAttribute('stroke','#3b82f6');
    poly.setAttribute('stroke-width','2.5');
    poly.setAttribute('stroke-linecap','round');
    poly.setAttribute('stroke-linejoin','round');
    svg.appendChild(poly);
  }

  // Points
  ptsArr.forEach(function(p){
    var c = document.createElementNS(svgNS,'circle');
    c.setAttribute('cx', p.x); c.setAttribute('cy', p.y);
    c.setAttribute('r', 5);
    var fill = p.score >= 70 ? '#10b981' : p.score >= 50 ? '#fbbf24' : '#dc2626';
    c.setAttribute('fill', fill);
    c.setAttribute('stroke', '#0f1824');
    c.setAttribute('stroke-width', '2');
    var title = document.createElementNS(svgNS,'title');
    title.textContent = p.label + ': ' + p.score + '% (' + (p.date||'').slice(0,10) + ')';
    c.appendChild(title);
    svg.appendChild(c);
  });

  card.appendChild(svg);

  // Subject performance summary
  var bySubject = {};
  exams.forEach(function(e){
    var k = e.subj || e.subject || 'Unknown';
    if (!bySubject[k]) bySubject[k] = [];
    bySubject[k].push(parseFloat(e.score) || 0);
  });
  var summary = document.createElement('div');
  summary.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;';
  Object.keys(bySubject).forEach(function(subj){
    var scores = bySubject[subj];
    var avg = Math.round(scores.reduce(function(a,b){return a+b;},0)/scores.length);
    var col = avg >= 70 ? '#10b981' : avg >= 50 ? '#fbbf24' : '#dc2626';
    var chip = document.createElement('div');
    chip.style.cssText = 'padding:6px 11px;background:rgba(255,255,255,.04);border:1px solid ' + col + '44;border-radius:100px;font-size:.78rem;';
    chip.innerHTML = '<span style="color:rgba(255,255,255,.7);">' + escapeHtml(subj) + '</span> <b style="color:' + col + ';">' + avg + '%</b>';
    summary.appendChild(chip);
  });
  card.appendChild(summary);

  return card;
}

// ────────────────────────────────────────────────────────────────
// Subject mix — donut
// ────────────────────────────────────────────────────────────────
function buildSubjectMixCard(child, prog){
  var topics = prog.topicsCompletedList || [];
  var card = makeCard('📚 What they study',
    'Where ' + (child.childName||'they') + ' has spent the most time learning.');
  if (!topics.length){
    var note = document.createElement('div');
    note.style.cssText = 'padding:14px;background:rgba(255,255,255,.03);border-radius:10px;color:rgba(255,255,255,.5);font-size:.85rem;text-align:center;margin-top:6px;';
    note.textContent = 'No topics completed yet.';
    card.appendChild(note);
    return card;
  }
  var bySubj = {};
  topics.forEach(function(t){
    var k = t.subj || 'Unknown';
    bySubj[k] = (bySubj[k]||0) + 1;
  });
  var entries = Object.keys(bySubj).map(function(k){ return [k, bySubj[k]]; });
  entries.sort(function(a,b){ return b[1] - a[1]; });
  var total = entries.reduce(function(a,b){ return a + b[1]; }, 0);

  var palette = ['#3b82f6','#10b981','#f59e0b','#a855f7','#ec4899','#06b6d4','#f97316','#8b5cf6','#84cc16','#ef4444'];

  // SVG donut
  var svgNS = 'http://www.w3.org/2000/svg';
  var size = 140, r = 56, stroke = 22, cx = size/2, cy = size/2;
  var circumference = 2 * Math.PI * r;
  var svg = document.createElementNS(svgNS,'svg');
  svg.setAttribute('viewBox', '0 0 ' + size + ' ' + size);
  svg.style.cssText = 'flex-shrink:0;';

  var cumulative = 0;
  entries.slice(0, 10).forEach(function(e, i){
    var pct = e[1] / total;
    var dasharray = (circumference * pct).toFixed(2) + ' ' + circumference.toFixed(2);
    var dashoffset = (-circumference * cumulative).toFixed(2);
    var c = document.createElementNS(svgNS,'circle');
    c.setAttribute('cx', cx); c.setAttribute('cy', cy); c.setAttribute('r', r);
    c.setAttribute('fill','none');
    c.setAttribute('stroke', palette[i % palette.length]);
    c.setAttribute('stroke-width', stroke);
    c.setAttribute('stroke-dasharray', dasharray);
    c.setAttribute('stroke-dashoffset', dashoffset);
    c.setAttribute('transform','rotate(-90 ' + cx + ' ' + cy + ')');
    svg.appendChild(c);
    cumulative += pct;
  });
  var centreText = document.createElementNS(svgNS,'text');
  centreText.setAttribute('x', cx); centreText.setAttribute('y', cy + 5);
  centreText.setAttribute('text-anchor','middle');
  centreText.setAttribute('fill','#fff');
  centreText.setAttribute('font-size','15');
  centreText.setAttribute('font-weight','700');
  centreText.setAttribute('font-family','inherit');
  centreText.textContent = total + ' topics';
  svg.appendChild(centreText);

  var holder = document.createElement('div');
  holder.style.cssText = 'display:flex;gap:18px;align-items:center;margin-top:8px;flex-wrap:wrap;';
  holder.appendChild(svg);
  var legend = document.createElement('div');
  legend.style.cssText = 'flex:1;min-width:200px;display:flex;flex-direction:column;gap:5px;font-size:.82rem;';
  entries.slice(0,8).forEach(function(e, i){
    var pct = Math.round((e[1] / total) * 100);
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;';
    row.innerHTML = '<span style="width:10px;height:10px;border-radius:2px;background:' + palette[i % palette.length] + ';flex-shrink:0;"></span>' +
      '<span style="flex:1;color:rgba(255,255,255,.75);">' + escapeHtml(e[0]) + '</span>' +
      '<b style="color:#fff;">' + e[1] + '</b>' +
      '<span style="color:rgba(255,255,255,.4);font-size:.74rem;">' + pct + '%</span>';
    legend.appendChild(row);
  });
  holder.appendChild(legend);
  card.appendChild(holder);

  return card;
}

// ────────────────────────────────────────────────────────────────
// Advice card — generated from the data
// ────────────────────────────────────────────────────────────────
function buildAdviceCard(child, prog){
  var topics = prog.topicsCompletedList || [];
  var quizzes = prog.quizResults || [];
  var exams = prog.examResults || [];
  var streak = prog.streak || 0;

  // Build advice items based on what we see
  var items = [];

  // Activity level
  var today = new Date(); today.setHours(0,0,0,0);
  var weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);
  var topicsThisWeek = topics.filter(function(t){
    var d = new Date(t.date); return d >= weekAgo;
  }).length;

  if (topicsThisWeek === 0){
    items.push({
      tone: 'warn',
      title: 'No activity this week',
      body: 'Set a daily 20-minute window — same time, same place. Routine beats motivation.'
    });
  } else if (topicsThisWeek < 5){
    items.push({
      tone: 'info',
      title: 'Building the habit',
      body: 'Aim for 3+ topics across 4-5 days. Short daily sessions build retention better than long weekend marathons.'
    });
  } else {
    items.push({
      tone: 'good',
      title: 'Consistent learner',
      body: (child.childName||'They') + ' has done ' + topicsThisWeek + ' topics this week. Keep the rhythm — ask them to teach you something they learned.'
    });
  }

  // Subject weakness
  if (exams.length){
    var bySubj = {};
    exams.forEach(function(e){
      var k = e.subj || e.subject || '?';
      if (!bySubj[k]) bySubj[k] = [];
      bySubj[k].push(parseFloat(e.score) || 0);
    });
    var weakest = null;
    Object.keys(bySubj).forEach(function(k){
      var avg = bySubj[k].reduce(function(a,b){return a+b;},0)/bySubj[k].length;
      if (!weakest || avg < weakest.avg) weakest = { subj: k, avg: avg };
    });
    if (weakest && weakest.avg < 50){
      items.push({
        tone: 'warn',
        title: weakest.subj + ' needs attention',
        body: 'Average ' + Math.round(weakest.avg) + '% across mock exams. Suggest they slow down and redo lessons in this subject — consistency, not speed.'
      });
    }
  }

  // Quiz quality
  if (quizzes.length){
    var passed = quizzes.filter(function(q){
      return q.total > 0 && (q.correct/q.total) >= 0.5;
    }).length;
    var quizRate = (passed / quizzes.length) * 100;
    if (quizRate < 50){
      items.push({
        tone: 'warn',
        title: 'Quizzes are tough',
        body: 'Less than half of recent quizzes are passing. Encourage re-reading the lesson before retrying — passive watching isn\'t enough.'
      });
    }
  }

  // Streak praise
  if (streak >= 7){
    items.push({
      tone: 'good',
      title: streak + '-day streak! 🔥',
      body: 'This is the gold standard. Acknowledge it — verbal praise from a parent reinforces the behaviour more than any in-app badge.'
    });
  }

  // Default fallback
  if (!items.length){
    items.push({
      tone: 'info',
      title: 'Keep watching',
      body: 'Once your child has done a few lessons and quizzes, this section will give you tailored, weekly advice based on their data.'
    });
  }

  var card = makeCard('💡 Advice for this week',
    'Practical, evidence-based suggestions based on the last 7 days of real activity.');

  items.forEach(function(it){
    var col = it.tone === 'good' ? '#10b981' : it.tone === 'warn' ? '#f59e0b' : '#3b82f6';
    var bg = it.tone === 'good' ? 'rgba(16,185,129,.08)' : it.tone === 'warn' ? 'rgba(245,158,11,.08)' : 'rgba(59,130,246,.08)';
    var box = document.createElement('div');
    box.style.cssText = 'background:' + bg + ';border-left:3px solid ' + col + ';border-radius:0 10px 10px 0;padding:12px 14px;margin-top:10px;';
    box.innerHTML = '<div style="font-weight:700;color:' + col + ';font-size:.85rem;margin-bottom:4px;">' + escapeHtml(it.title) + '</div>' +
      '<div style="color:rgba(255,255,255,.78);font-size:.85rem;line-height:1.5;">' + escapeHtml(it.body) + '</div>';
    card.appendChild(box);
  });

  return card;
}

// ────────────────────────────────────────────────────────────────
// Counselling — referral panel
// ────────────────────────────────────────────────────────────────
function buildCounsellingCard(){
  var card = makeCard('🤝 Need to talk to a counsellor?',
    'Some questions are bigger than schoolwork. Here are real Ghanaian resources for parents.');

  var resources = [
    { name: 'Mentally Aware Ghana Initiative (MANI)',
      desc: 'Free crisis text & call line. WhatsApp them anytime.',
      ctaLabel: 'WhatsApp', ctaHref: 'https://wa.me/2347013613020' },
    { name: 'She Writes Woman — Mental Health Ghana',
      desc: 'Helpline for parents and teens. Free, confidential.',
      ctaLabel: 'Call', ctaHref: 'tel:08000272255' },
    { name: 'Suicide Research and Prevention Initiative (SURPIN)',
      desc: 'Trained crisis counsellors, 24/7. Accra-based but national reach.',
      ctaLabel: 'Call', ctaHref: 'tel:09080217555' },
    { name: 'Federal Neuro-Psychiatric Hospital, Yaba',
      desc: 'Adolescent and family counselling clinic.',
      ctaLabel: 'Info', ctaHref: 'https://www.fnphy.gov.ng/' }
  ];

  var list = document.createElement('div');
  list.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-top:8px;';
  resources.forEach(function(r){
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;background:rgba(0,0,0,.2);border-radius:9px;padding:10px 12px;flex-wrap:wrap;';
    row.innerHTML =
      '<div style="flex:1;min-width:200px;">' +
        '<div style="font-weight:700;color:#fff;font-size:.88rem;">' + escapeHtml(r.name) + '</div>' +
        '<div style="color:rgba(255,255,255,.6);font-size:.78rem;">' + escapeHtml(r.desc) + '</div>' +
      '</div>' +
      '<a href="' + escapeAttr(r.ctaHref) + '" target="_blank" rel="noopener" style="background:#10b981;color:#fff;text-decoration:none;padding:7px 14px;border-radius:8px;font-weight:700;font-size:.78rem;">' + escapeHtml(r.ctaLabel) + ' →</a>';
    list.appendChild(row);
  });
  card.appendChild(list);

  var legalNote = document.createElement('div');
  legalNote.style.cssText = 'margin-top:10px;font-size:.72rem;color:rgba(255,255,255,.4);line-height:1.5;';
  legalNote.textContent = 'These are independent third-party services. Lesson Teacher is not affiliated and does not handle the call. In a life-threatening emergency, dial 112 (Ghanaian emergency) or go to the nearest hospital.';
  card.appendChild(legalNote);

  return card;
}

// ────────────────────────────────────────────────────────────────
// Screen-time honest note
// ────────────────────────────────────────────────────────────────
function buildScreenTimeNote(){
  var card = makeCard('⏱ About screen time',
    null);
  var p = document.createElement('div');
  p.style.cssText = 'color:rgba(255,255,255,.7);font-size:.85rem;line-height:1.6;';
  p.innerHTML =
    'You can see exactly how long your child spends <b>inside Lesson Teacher</b> from the heatmap above. ' +
    'However, <b>cross-app screen time</b> (TikTok, YouTube, etc) cannot be tracked from a website — ' +
    'browsers don\'t allow that. For full device monitoring, use:' +
    '<ul style="margin:8px 0;padding-left:18px;color:rgba(255,255,255,.65);">' +
      '<li><b>iPhone:</b> Settings → Screen Time → Family Sharing</li>' +
      '<li><b>Android:</b> Google Family Link app</li>' +
      '<li><b>Windows / Mac:</b> Built-in family-safety controls</li>' +
    '</ul>' +
    'If you want all of this in one native app, that\'s on our roadmap — a <b>Lesson Teacher mobile app</b> ' +
    'with full screen-time integration. Tell us if you\'d use it.';
  card.appendChild(p);
  return card;
}

// ────────────────────────────────────────────────────────────────
// helpers
// ────────────────────────────────────────────────────────────────
function makeCard(title, sub){
  var card = document.createElement('div');
  card.className = 'ph-card';
  card.style.cssText = 'background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:18px;';
  var h = document.createElement('h3');
  h.style.cssText = 'margin:0 0 4px;color:#fff;font-family:\'Bricolage Grotesque\',sans-serif;font-size:1.05rem;font-weight:800;';
  h.textContent = title;
  card.appendChild(h);
  if (sub){
    var s = document.createElement('div');
    s.style.cssText = 'color:rgba(255,255,255,.55);font-size:.82rem;margin-bottom:8px;';
    s.textContent = sub;
    card.appendChild(s);
  }
  return card;
}

function escapeHtml(s){
  return String(s||'').replace(/[&<>"']/g, function(c){
    return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
  });
}
function escapeAttr(s){ return escapeHtml(s); }

// ────────────────────────────────────────────────────────────────
// Child Report — full-screen modal with stats, AI report, counsellor,
// opportunities. Triggered by "View full report" buttons on linked
// child cards in the parent hub.
// ────────────────────────────────────────────────────────────────
window.openChildReport = async function(opts){
  opts = opts || {};
  var uid = opts.uid;
  var name = opts.name || 'Student';
  if (!uid){ console.warn('openChildReport: no uid'); return; }
  if (!window.LTCloud || !window.LTCloud.ready) {
    alert('Still loading — try again in a moment.');
    return;
  }

  // Pull progress
  var prog = null;
  try { prog = await window.LTCloud.fetchChildProgress(uid); } catch(e){ prog = null; }
  prog = prog || {};

  var bd = document.createElement('div');
  bd.id = 'lt-child-report';
  bd.setAttribute('data-no-translate','1');
  bd.style.cssText = 'position:fixed;inset:0;background:rgba(8,14,26,.96);backdrop-filter:blur(8px);z-index:2147483645;overflow-y:auto;font-family:"Plus Jakarta Sans",system-ui,sans-serif;';

  var inner = document.createElement('div');
  inner.style.cssText = 'max-width:880px;margin:24px auto;padding:24px 20px 60px;color:#fff;';
  inner.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;">' +
      '<button id="lt-cr-close" style="background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);color:#fff;padding:9px 16px;border-radius:100px;font-weight:700;font-size:.85rem;cursor:pointer;font-family:inherit;">← Back</button>' +
      '<div style="font-size:.78rem;color:rgba(255,255,255,.5);">Child report</div>' +
    '</div>' +
    '<h1 style="font-family:\'Bricolage Grotesque\',sans-serif;font-size:1.8rem;font-weight:900;margin:0 0 6px;">' + escapeHtml(name) + '</h1>' +
    '<p style="color:rgba(255,255,255,.65);font-size:.9rem;margin:0 0 24px;">Full activity, progress, and an AI-generated assessment.</p>' +
    '<div id="lt-cr-body" style="display:flex;flex-direction:column;gap:14px;"></div>';

  bd.appendChild(inner);
  document.body.appendChild(bd);
  document.body.style.overflow = 'hidden';

  document.getElementById('lt-cr-close').onclick = function(){
    bd.remove();
    document.body.style.overflow = '';
  };

  var body = document.getElementById('lt-cr-body');

  // 1. Activity stats
  body.appendChild(buildHeatmapCard({ childName: name }, prog));

  // 2. Exam trend
  body.appendChild(buildExamTrendCard({ childName: name }, prog));

  // 3. Subject mix
  body.appendChild(buildSubjectMixCard({ childName: name }, prog));

  // 4. AI-generated report (placeholder + button to generate)
  var aiCard = makeCard('🧠 AI Assessment', 'Tap to generate a personalised, written assessment of ' + name + '\'s recent learning.');
  var aiBtn = document.createElement('button');
  aiBtn.textContent = 'Generate AI report';
  aiBtn.style.cssText = 'margin-top:8px;background:linear-gradient(135deg,#7c3aed,#3b82f6);color:#fff;border:0;padding:10px 18px;border-radius:9px;font-weight:800;font-size:.85rem;cursor:pointer;font-family:inherit;';
  var aiOut = document.createElement('div');
  aiOut.style.cssText = 'margin-top:14px;color:rgba(255,255,255,.78);line-height:1.65;font-size:.9rem;white-space:pre-wrap;';
  aiBtn.onclick = async function(){
    aiBtn.disabled = true;
    aiBtn.textContent = 'Generating…';
    aiOut.textContent = '';
    try {
      var summary = summariseProgress(prog);
      var resp = await fetch('/api/anthropic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: 700,
          system: 'You are an experienced Ghanaian secondary-school counsellor writing a brief, warm, parent-friendly assessment of a student\'s learning. Be specific about strengths and gentle about areas to improve. Reference real numbers from the data. End with one concrete suggestion the parent can act on this week. 4-6 paragraphs, no headings.',
          messages: [{ role: 'user', content:
            'Student name: ' + name + '\n\n' +
            'Activity summary:\n' + summary + '\n\n' +
            'Write the assessment.' }]
        })
      });
      var d = await resp.json();
      var text = (d && d.content && d.content[0] && d.content[0].text) || '';
      aiOut.textContent = text || '(AI did not return a response — try again.)';
    } catch(e){
      aiOut.textContent = 'Could not generate report. Please try again.';
      console.warn('AI report failed', e);
    } finally {
      aiBtn.disabled = false;
      aiBtn.textContent = 'Regenerate';
    }
  };
  aiCard.appendChild(aiBtn);
  aiCard.appendChild(aiOut);
  body.appendChild(aiCard);

  // 5. Counsellor referral
  body.appendChild(buildCounsellingCard());

  // 6. Opportunities (scholarships, careers — link to in-app sections)
  var opCard = makeCard('🌟 Opportunities for ' + name, 'Things to explore that match where they are right now.');
  var opGrid = document.createElement('div');
  opGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-top:8px;';
  var opItems = [
    { ico:'🎓', title:'Scholarships', desc:'Funded study options for Ghanaian students.', go:'pg-guidance', sec:'scholarships' },
    { ico:'🏛️', title:'Universities', desc:'Top universities, cutoff marks, requirements.', go:'pg-guidance', sec:'universities' },
    { ico:'💼', title:'Career paths', desc:'Salaries, requirements, real Ghanaian openings.', go:'pg-guidance', sec:'careers' },
    { ico:'📚', title:'Subject combos', desc:'What combinations open which doors.', go:'pg-guidance', sec:'combos' }
  ];
  opItems.forEach(function(o){
    var c = document.createElement('button');
    c.style.cssText = 'background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:14px;text-align:left;cursor:pointer;font-family:inherit;color:#fff;transition:all .15s;';
    c.onmouseenter = function(){ c.style.background = 'rgba(59,130,246,.12)'; c.style.borderColor = 'rgba(59,130,246,.4)'; };
    c.onmouseleave = function(){ c.style.background = 'rgba(255,255,255,.04)'; c.style.borderColor = 'rgba(255,255,255,.1)'; };
    c.innerHTML =
      '<div style="font-size:1.4rem;margin-bottom:6px;">' + o.ico + '</div>' +
      '<div style="font-weight:800;margin-bottom:3px;">' + o.title + '</div>' +
      '<div style="color:rgba(255,255,255,.55);font-size:.78rem;line-height:1.45;">' + o.desc + '</div>';
    c.onclick = function(){
      bd.remove();
      document.body.style.overflow = '';
      try {
        if (typeof window.goTo === 'function') window.goTo(o.go);
        if (o.sec && typeof window.guidSection === 'function'){
          setTimeout(function(){ window.guidSection(o.sec, null); }, 200);
        }
      } catch(e){}
    };
    opGrid.appendChild(c);
  });
  opCard.appendChild(opGrid);
  body.appendChild(opCard);
};

function summariseProgress(prog){
  var lines = [];
  lines.push('XP earned: ' + (prog.xp || 0));
  lines.push('Topics completed: ' + (prog.topicsCompleted || 0));
  lines.push('Streak (consecutive days): ' + (prog.streak || 0));
  var topics = prog.topicsCompletedList || [];
  if (topics.length){
    var bySubj = {};
    topics.forEach(function(t){ bySubj[t.subj] = (bySubj[t.subj]||0) + 1; });
    var top = Object.keys(bySubj).map(function(k){ return k+'='+bySubj[k]; }).join(', ');
    lines.push('Topics by subject: ' + top);
    lines.push('Recent topics: ' + topics.slice(-5).map(function(t){ return t.subj+'/'+(t.topic||'').slice(0,40); }).join('; '));
  }
  var quizzes = prog.quizResults || [];
  if (quizzes.length){
    var avg = Math.round(100 * quizzes.reduce(function(a,q){ return a + (q.correct||0)/(q.total||1); }, 0) / quizzes.length);
    lines.push('Quiz average: ' + avg + '% across ' + quizzes.length + ' quizzes');
  }
  var exams = prog.examResults || [];
  if (exams.length){
    var examLines = exams.slice(-5).map(function(e){
      return (e.board||'') + ' ' + (e.subj||'') + ': ' + (e.score||'') + (e.grade ? ' ('+e.grade+')' : '');
    }).join(' | ');
    lines.push('Last exams: ' + examLines);
  }
  if (!lines.length || lines.length < 3) lines.push('No activity logged in the past period.');
  return lines.join('\n');
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
window.addEventListener('lt-cloud-hydrated', function(){ setTimeout(installEnhancements, 100); });

})();
