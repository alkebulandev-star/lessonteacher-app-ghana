/* ════════════════════════════════════════════════════════════════
   ARENA RULES OVERLAY (v13)
   ────────────────────────────────────────────────────────────────
   Shows clear, per-game rules + a 3-second countdown before each
   live-game match starts. Patches ArenaUI._startGame so the user
   knows: how long the round is, how to score, what counts as a
   win, what the penalty is for leaving early.
   ════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

var RULES = {
  math_race: {
    title: '⚡ Math Race',
    timer: '60 seconds',
    howToPlay: [
      'A new math problem appears every time you answer.',
      'Type the answer and press Enter.',
      'Correct answer = points; wrong answer = 0 (no penalty).',
      'Faster answers earn more points than slow ones.'
    ],
    win: 'Highest score when the 60-second timer runs out.',
    penalty: 'Leaving mid-match counts as a forfeit.'
  },
  quiz_duel: {
    title: '⚔️ Quiz Duel',
    timer: '15 seconds per question',
    howToPlay: [
      'Multiple-choice questions on your subject.',
      'Tap an answer before the timer runs out.',
      'Correct under 5 seconds = bonus points.',
      'No re-answers — first tap counts.'
    ],
    win: 'Highest total score after all 10 questions.',
    penalty: 'Leaving mid-match counts as a forfeit.'
  },
  spelling_bee: {
    title: '🐝 Spelling Bee',
    timer: '90 seconds',
    howToPlay: [
      'You hear a word. Type it correctly.',
      'Spelling must be exact — no caps required.',
      'Each correct word = 1 point.',
      'Replays cost 2 seconds.'
    ],
    win: 'Most words spelled correctly.',
    penalty: 'Leaving mid-match counts as a forfeit.'
  },
  memory_match: {
    title: '🧠 Memory Match',
    timer: '120 seconds',
    howToPlay: [
      'Flip cards to find pairs.',
      'Each match = 5 points; each miss = -1.',
      'Find all pairs to win the time bonus.',
      'Cards reshuffle if you abandon mid-game.'
    ],
    win: 'Most pairs found in the time limit (or fastest full clear).',
    penalty: 'Leaving mid-match counts as a forfeit.'
  },
  geo_sprint: {
    title: '🌍 Geography Sprint',
    timer: '60 seconds',
    howToPlay: [
      'A country, capital, or flag question every round.',
      'Multiple choice — first correct answer scores.',
      'Faster = more points.',
      '10 questions per round.'
    ],
    win: 'Highest score after 10 questions.',
    penalty: 'Leaving mid-match counts as a forfeit.'
  },
  word_builder: {
    title: '🔤 Word Builder',
    timer: '90 seconds',
    howToPlay: [
      'Letters are scrambled — rearrange them into a real word.',
      'Each correct word = 5 points.',
      'Hint costs 2 points.',
      'Skip allowed but no points for skipped words.'
    ],
    win: 'Most words built in 90 seconds.',
    penalty: 'Leaving mid-match counts as a forfeit.'
  }
};

var DEFAULT_RULES = {
  title: '🏟️ Live Match',
  timer: 'Timed round',
  howToPlay: [
    'Score as many points as you can within the time limit.',
    'Wrong answers don\'t hurt your score — but they cost you time.',
    'Top score on the scoreboard wins the match.'
  ],
  win: 'Highest score when time runs out.',
  penalty: 'Leaving mid-match counts as a forfeit.'
};

function showRules(gameId){
  return new Promise(function(resolve){
    var rules = RULES[gameId] || DEFAULT_RULES;
    var stage = document.getElementById('arGameStage');
    if (!stage) { resolve(); return; }

    stage.innerHTML =
      '<div class="ar-rules-card" style="max-width:440px;width:100%;background:rgba(15,24,36,.65);border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:24px;text-align:left;">' +
        '<div style="text-align:center;margin-bottom:6px;font-family:\'Bricolage Grotesque\',sans-serif;font-weight:900;font-size:1.5rem;color:#fff;">' + rules.title + '</div>' +
        '<div style="text-align:center;color:rgba(168,85,247,.85);font-weight:700;font-size:.85rem;margin-bottom:18px;">⏱ ' + rules.timer + '</div>' +
        '<div style="margin-bottom:14px;">' +
          '<div style="font-size:.7rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.55);margin-bottom:6px;">How to play</div>' +
          '<ul style="margin:0;padding-left:20px;color:rgba(255,255,255,.85);font-size:.88rem;line-height:1.6;">' +
            rules.howToPlay.map(function(r){ return '<li>' + r + '</li>'; }).join('') +
          '</ul>' +
        '</div>' +
        '<div style="margin-bottom:14px;display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
          '<div style="background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.2);padding:10px 12px;border-radius:9px;">' +
            '<div style="font-size:.66rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#34d399;margin-bottom:4px;">🏆 Win</div>' +
            '<div style="font-size:.78rem;color:rgba(255,255,255,.85);line-height:1.45;">' + rules.win + '</div>' +
          '</div>' +
          '<div style="background:rgba(220,38,38,.08);border:1px solid rgba(220,38,38,.18);padding:10px 12px;border-radius:9px;">' +
            '<div style="font-size:.66rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#fca5a5;margin-bottom:4px;">⚠ Penalty</div>' +
            '<div style="font-size:.78rem;color:rgba(255,255,255,.85);line-height:1.45;">' + rules.penalty + '</div>' +
          '</div>' +
        '</div>' +
        '<button id="ar-rules-go" style="width:100%;background:linear-gradient(135deg,#a855f7,#7c3aed);color:#fff;border:0;padding:13px;border-radius:11px;font-weight:800;font-size:1rem;cursor:pointer;font-family:inherit;">I\'m ready · Start match →</button>' +
        '<div id="ar-rules-count" style="text-align:center;color:rgba(255,255,255,.4);font-size:.75rem;margin-top:8px;">or auto-start in 8s…</div>' +
      '</div>';

    var done = false;
    var btn = document.getElementById('ar-rules-go');
    var countEl = document.getElementById('ar-rules-count');
    var t = 8;
    var iv = setInterval(function(){
      t--;
      if (countEl) countEl.textContent = 'or auto-start in ' + t + 's…';
      if (t <= 0){ clearInterval(iv); fire(); }
    }, 1000);
    function fire(){
      if (done) return; done = true;
      clearInterval(iv);
      // 3-2-1 countdown then resolve
      var n = 3;
      stage.innerHTML = '<div id="ar-go" style="font-size:5rem;font-weight:900;font-family:\'Bricolage Grotesque\',sans-serif;color:#fff;text-shadow:0 0 32px rgba(168,85,247,.8);">3</div>';
      var go = setInterval(function(){
        n--;
        var el = document.getElementById('ar-go');
        if (!el) { clearInterval(go); resolve(); return; }
        if (n === 0){ el.textContent = 'GO!'; el.style.color = '#34d399'; }
        else if (n < 0){ clearInterval(go); resolve(); }
        else el.textContent = String(n);
      }, 700);
    }
    if (btn) btn.onclick = fire;
  });
}

function patch(){
  if (!window.ArenaUI || typeof window.ArenaUI._startGame !== 'function'){
    setTimeout(patch, 400);
    return;
  }
  if (window.ArenaUI._startGame.__rulesHooked) return;
  var orig = window.ArenaUI._startGame;
  window.ArenaUI._startGame = function(gameId, roomJson){
    var args = arguments, self = this;
    showRules(gameId).then(function(){
      orig.apply(self, args);
    });
  };
  window.ArenaUI._startGame.__rulesHooked = true;
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', patch);
else patch();
})();
