/* ════════════════════════════════════════════════════════════════
   ARENA REALTIME WIRING
   Patches arena-0.js so it uses LTRealtime (Firestore) instead of
   the local generateRooms() / fake players / fake chat. Falls back
   to original behaviour if LTRealtime is not ready.
   ════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

var ATTACHED = false;
var lastUnsubRooms = null;
var lastUnsubLobbyChat = null;
var lastUnsubSpecChat = null;
var currentRoomId = null;

function tryAttach(){
  if (ATTACHED) return;
  if (!window.LTRealtime || !window.LTRealtime.ready) return;
  if (!window.ArenaUI) return;
  ATTACHED = true;
  patchArenaRefresh();
  patchArenaCreateRoom();
  patchArenaJoinSpectate();
  patchLobbyChat();
}

window.addEventListener('lt-realtime-ready', tryAttach);
// Also poll briefly in case the order is reversed
var pollIv = setInterval(function(){
  tryAttach();
  if (ATTACHED) clearInterval(pollIv);
}, 500);
setTimeout(function(){ clearInterval(pollIv); }, 30000);

// ────────────────────────────────────────────────────────────────
// 1. Replace ArenaUI.refresh() to subscribe to Firestore rooms
// ────────────────────────────────────────────────────────────────
function patchArenaRefresh(){
  if (!window.ArenaUI || typeof window.ArenaUI.refresh !== 'function') return;
  var origRefresh = window.ArenaUI.refresh;

  window.ArenaUI.refresh = function(){
    // Run original first to set up grid containers and leaderboard
    origRefresh.apply(this, arguments);

    // Identify state
    var st = window.ArenaUI && window.ArenaUI._state ? window.ArenaUI._state : null;
    // Fallback: read from DOM tabs
    var classGroup = document.querySelector('#arenaClassTabs .ar-tab.on');
    classGroup = classGroup ? classGroup.getAttribute('data-cg') : null;
    var scope = document.querySelector('#arenaScopeTabs .ar-tab.on');
    scope = scope ? scope.getAttribute('data-sc') : null;
    var format = document.querySelector('#arenaFormatTabs .ar-tab.on');
    format = format ? format.getAttribute('data-fmt') : 'any';

    if (!classGroup || !scope) return;

    // Clean up previous subscription
    if (lastUnsubRooms){ try { lastUnsubRooms(); } catch(e){} lastUnsubRooms = null; }

    // Show "loading" state
    var grid = document.getElementById('arenaRoomList');
    if (grid && !grid.querySelector('.ar-room')){
      grid.innerHTML = '<div class="ar-empty">Loading live rooms…</div>';
    }

    lastUnsubRooms = window.LTRealtime.listRoomsLive(
      { classGroup: classGroup, scope: scope, format: format },
      function(rooms){
        renderRoomGrid(rooms);
      }
    );
  };
}

function renderRoomGrid(rooms){
  var grid = document.getElementById('arenaRoomList');
  var strip = document.getElementById('arenaLiveStrip');
  if (!grid) return;

  if (!rooms || !rooms.length){
    grid.innerHTML =
      '<div class="ar-empty" style="padding:30px 20px;text-align:center;">' +
        '<div style="font-size:2.6rem;margin-bottom:6px;">🌙</div>' +
        '<div style="font-weight:800;color:#fff;font-size:1.05rem;margin-bottom:4px;">Quiet right now</div>' +
        '<div style="color:rgba(255,255,255,.6);font-size:.88rem;margin-bottom:14px;">Be the first to host a room — or we\'ll spin up an AI study partner if you create one and nobody joins in 20 seconds.</div>' +
        '<button onclick="ArenaUI.createRoom()" style="background:linear-gradient(135deg,#3b82f6,#2563eb);color:#fff;border:0;border-radius:10px;padding:11px 22px;font-weight:800;font-size:.9rem;cursor:pointer;font-family:inherit;">+ Host a room</button>' +
      '</div>';
    if (strip) strip.innerHTML = '';
    return;
  }

  // Live strip
  if (strip){
    var liveRooms = rooms.filter(function(r){ return r.status === 'live'; });
    if (!liveRooms.length){
      strip.innerHTML = '';
    } else {
      var totalViewers = liveRooms.reduce(function(a,r){ return a + (r.viewers||0); }, 0);
      strip.innerHTML =
        '<div style="display:flex;align-items:center;justify-content:space-between;margin:14px 0 6px">' +
          '<div style="display:flex;align-items:center;gap:10px;font-weight:800;font-size:.82rem">' +
            '<span class="ar-live-dot"></span> <span style="font-family:\'Bricolage Grotesque\',sans-serif;letter-spacing:-.01em">' + liveRooms.length + ' games LIVE right now</span>' +
          '</div>' +
          '<span class="ar-vbadge">👁 ' + totalViewers.toLocaleString() + ' watching</span>' +
        '</div>' +
        '<div class="ar-live-bar">' +
          liveRooms.map(function(r){
            var pchips = (r.players||[]).slice(0,4).map(function(p){
              return '<span class="ar-pchip">' + escapeHtml(p.avatar||'🙂') + '</span>';
            }).join('');
            var since = r.startedAt ? Math.max(1, Math.floor((Date.now() - r.startedAt) / 1000)) : '—';
            var rj = encodeURIComponent(r.id);
            return '<div class="ar-live-card" onclick="ArenaWiring.spectate(\'' + rj + '\')">' +
              '<div style="display:flex;align-items:center;justify-content:space-between"><span class="ar-live-badge"><span class="ar-live-dot"></span> Live</span><span style="font-size:.7rem;color:#fbbf24;font-weight:800">🎁 GH₵' + ((r.prize||0).toLocaleString()) + '</span></div>' +
              '<div class="lc-game"><span style="font-size:1.3rem">' + escapeHtml(r.gameEmoji||'🎮') + '</span>' + escapeHtml(r.gameName||'Match') + '</div>' +
              '<div class="lc-meta">👥 ' + ((r.players||[]).length) + ' playing · 👁 ' + (r.viewers||0) + ' watching · ⏱ ' + since + 's in</div>' +
              '<div class="ar-room-players" style="margin:2px 0">' + pchips + '</div>' +
              '<button class="lc-watch">📺 Watch live</button>' +
            '</div>';
          }).join('') +
        '</div>';
    }
  }

  // Full grid
  grid.innerHTML = rooms.map(function(r){
    var playersHtml = (r.players||[]).slice(0,5).map(function(p){
      return '<span class="ar-pchip" title="' + escapeHtml(p.name||'') + '">' + escapeHtml(p.avatar||'🙂') + '</span>';
    }).join('');
    var more = (r.players||[]).length > 5 ? '<span class="ar-pchip">+' + ((r.players||[]).length - 5) + '</span>' : '';
    var statusBadge = r.status === 'live'
      ? '<span class="ar-live-badge"><span class="ar-live-dot"></span> Live · 👁 ' + (r.viewers||0) + '</span>'
      : '<span class="ar-vbadge" style="color:#34d399;border-color:rgba(16,185,129,.35)">● Open · waiting</span>';
    var rj = encodeURIComponent(r.id);
    var actionBtn;
    if (r.status === 'live'){
      actionBtn =
        '<button class="ar-spec" onclick="ArenaWiring.spectate(\'' + rj + '\')">📺 Spectate</button>' +
        '<button class="ar-join" onclick="ArenaWiring.spectate(\'' + rj + '\')">Watch &amp; cheer →</button>';
    } else if ((r.players||[]).length >= (r.maxPlayers||2)){
      actionBtn = '<button class="ar-join" disabled>Full</button>';
    } else {
      actionBtn = '<button class="ar-join" onclick="ArenaWiring.joinRoom(\'' + rj + '\')">Join →</button>';
    }
    return '<div class="ar-room">' +
      '<div class="ar-room-top">' +
        '<div class="ar-room-game"><span class="ar-room-emoji">' + escapeHtml(r.gameEmoji||'🎮') + '</span>' + escapeHtml(r.gameName||'Match') + '</div>' +
        '<div class="ar-room-prize">🎁 GH₵' + ((r.prize||0).toLocaleString()) + '</div>' +
      '</div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap"><span class="ar-vbadge" style="color:#a78bfa;border-color:rgba(167,139,250,.4)">' + escapeHtml(r.formatEmoji||'🎮') + ' ' + escapeHtml(r.formatName||'Match') + '</span></div>' +
      '<div>' + statusBadge + '</div>' +
      '<div class="ar-room-meta">⏱ ' + escapeHtml(r.duration||'') + ' · 👥 ' + ((r.players||[]).length) + '/' + (r.maxPlayers||2) + (r.state ? ' · ' + escapeHtml(r.state) : '') + '</div>' +
      '<div class="ar-room-players">' + playersHtml + more + '</div>' +
      '<div class="ar-room-actions">' + actionBtn + '</div>' +
    '</div>';
  }).join('');
}

// ────────────────────────────────────────────────────────────────
// 2. Replace _hostRoom to publish to Firestore
// ────────────────────────────────────────────────────────────────
function patchArenaCreateRoom(){
  if (!window.ArenaUI || typeof window.ArenaUI._hostRoom !== 'function'){
    // Set up later when arena DOM is built
    setTimeout(patchArenaCreateRoom, 500);
    return;
  }
  var origHost = window.ArenaUI._hostRoom;
  window.ArenaUI._hostRoom = async function(){
    try {
      var fmtSel = document.getElementById('arNewFmt');
      var gameSel = document.getElementById('arNewGame');
      var nameInp = document.getElementById('arNewName');
      var formatId = fmtSel ? fmtSel.value : 'duo';
      var gameId = gameSel ? gameSel.value : 'quiz';
      // Read from arena's static data via window globals
      var FORMATS = window._ArenaFormats || [
        { id:'solo', name:'Solo', emoji:'🎯', size:1, team:1 },
        { id:'duo',  name:'1v1 Duo', emoji:'⚔️', size:2, team:1 },
        { id:'quad', name:'Quad', emoji:'🎲', size:4, team:1 },
        { id:'ffa',  name:'FFA', emoji:'🌪️', size:6, team:1 },
        { id:'team', name:'Teams', emoji:'🤝', size:6, team:3 }
      ];
      var GAMES_INFO = window._ArenaGames || [];
      var fmt = FORMATS.find(function(f){ return f.id === formatId; }) || FORMATS[1];
      var game = GAMES_INFO.find(function(g){ return g.id === gameId; }) || { id:gameId, name:'Quiz', emoji:'🧠', duration:'3 min' };

      var classGroup = document.querySelector('#arenaClassTabs .ar-tab.on');
      classGroup = classGroup ? classGroup.getAttribute('data-cg') : 'seniors';
      var scope = document.querySelector('#arenaScopeTabs .ar-tab.on');
      scope = scope ? scope.getAttribute('data-sc') : 'local';
      var prizeBase = scope === 'nationwide' ? 5000 : scope === 'state' ? 1500 : 500;

      var roomData = {
        classGroup: classGroup,
        scope: scope,
        gameId: game.id,
        gameName: game.name,
        gameEmoji: game.emoji,
        duration: game.duration || '3 min',
        format: fmt.id,
        formatName: fmt.name,
        formatEmoji: fmt.emoji,
        maxPlayers: fmt.size,
        teamSize: fmt.team,
        prize: prizeBase + Math.floor(Math.random() * prizeBase / 2),
        roomTitle: nameInp ? (nameInp.value || '').trim() : ''
      };
      // Close the create modal
      var m = document.querySelector('.ar-modal'); if (m) m.remove();

      var roomId = await window.LTRealtime.createRoom(roomData);

      // Open lobby for this room (waits for players or AI)
      openCloudLobby(roomId);

      // After 20s, if still alone, offer to spawn AI
      setTimeout(function(){ offerAIIfAlone(roomId); }, 20000);
    } catch(err){
      console.error('Host room failed', err);
      alert('Could not create room: ' + (err.message || err));
    }
  };
}

async function offerAIIfAlone(roomId){
  if (!window.LTRealtime || !window.LTRealtime.ready) return;
  // Read room state via a one-shot subscribe
  var unsub = window.LTRealtime.subscribeRoom(roomId, async function(r){
    unsub();
    if (!r) return;
    var humanCount = (r.players||[]).filter(function(p){ return !p.isAI; }).length;
    if (humanCount > 1) return; // someone joined
    if ((r.players||[]).length >= (r.maxPlayers||2)) return; // full
    if (r.status !== 'open') return;

    // Show AI offer
    var go = confirm('No human player has joined yet. Would you like to play against an AI study partner instead?');
    if (!go) return;
    try { await window.LTRealtime.spawnAIOpponent(roomId); } catch(e){ console.warn(e); }
  });
}

// ────────────────────────────────────────────────────────────────
// 3. Cloud-aware lobby
// ────────────────────────────────────────────────────────────────
window.ArenaWiring = window.ArenaWiring || {};

window.ArenaWiring.joinRoom = async function(encodedId){
  var roomId = decodeURIComponent(encodedId);
  try {
    await window.LTRealtime.joinRoom(roomId);
    openCloudLobby(roomId);
  } catch(e){
    alert(e.message || 'Could not join room');
  }
};

window.ArenaWiring.spectate = function(encodedId){
  var roomId = decodeURIComponent(encodedId);
  openCloudSpectate(roomId);
};

function openCloudLobby(roomId){
  // Close any existing modal
  document.querySelectorAll('.ar-modal,#arGameModal,#arLobbyModal,#arCloudLobby,#arCloudSpec').forEach(function(n){ n.remove(); });
  if (lastUnsubLobbyChat){ try { lastUnsubLobbyChat(); } catch(e){} lastUnsubLobbyChat = null; }

  currentRoomId = roomId;

  var m = document.createElement('div');
  m.className = 'ar-modal';
  m.id = 'arCloudLobby';
  m.innerHTML = '<div class="ar-lobby-card" style="min-height:520px"></div>';
  document.body.appendChild(m);
  var card = m.querySelector('.ar-lobby-card');

  var unsubRoom = null;
  var roomData = null;

  function render(){
    if (!roomData){
      card.innerHTML = '<div style="padding:40px;text-align:center;color:rgba(255,255,255,.6);">Loading room…</div>';
      return;
    }
    var r = roomData;
    var me = (window.LTAuth && window.LTAuth.user) ? window.LTAuth.user.uid : null;
    var meEntry = (r.players||[]).find(function(p){ return p.uid === me; });
    var amHost = r.hostUid === me;
    var allReady = (r.players||[]).length >= 2 && (r.players||[]).every(function(p){ return p.ready; });
    var canStart = amHost && allReady;

    var slotsHtml = '';
    for (var i = 0; i < (r.maxPlayers||2); i++){
      var p = (r.players||[])[i];
      if (p){
        slotsHtml += '<div class="ar-lob-slot ' + (p.uid === me ? 'you' : '') + '">' +
          '<div class="ar-lob-av">' + escapeHtml(p.avatar||'🙂') + '</div>' +
          '<div><div class="ar-lob-pn">' + escapeHtml(p.name||'') + (p.uid === me ? ' (you)' : '') + (p.isAI ? ' <span style="color:#a78bfa;font-size:.72rem;font-weight:700;">AI</span>' : '') + '</div>' +
          '<div class="ar-lob-ps">' + escapeHtml(p.state||'—') + '</div></div>' +
          '<div class="ar-lob-ready ' + (p.ready ? 'y' : 'n') + '">' + (p.ready ? 'READY' : '…') + '</div>' +
        '</div>';
      } else {
        slotsHtml += '<div class="ar-lob-slot empty">' +
          '<div class="ar-lob-av">＋</div>' +
          '<div><div class="ar-lob-pn">Waiting for player…</div>' +
          '<div class="ar-lob-ps">Open slot</div></div></div>';
      }
    }
    var humanCount = (r.players||[]).filter(function(p){ return !p.isAI; }).length;
    var aiSection = '';
    if (amHost && humanCount === 1 && (r.players||[]).length < (r.maxPlayers||2)){
      aiSection =
        '<div style="margin:12px 0;padding:14px;background:linear-gradient(135deg,rgba(168,85,247,.15),rgba(59,130,246,.1));border:1px dashed rgba(167,139,250,.4);border-radius:10px;">' +
          '<div style="font-weight:700;color:#c4b5fd;margin-bottom:4px;">🤖 No human yet?</div>' +
          '<div style="color:rgba(255,255,255,.7);font-size:.85rem;margin-bottom:10px;">Play against an AI study partner now. The AI uses real reasoning — it answers honestly, with a thinking delay, just like a real player.</div>' +
          '<button onclick="ArenaWiring.spawnAI(\'' + roomId + '\')" style="background:linear-gradient(135deg,#a855f7,#7c3aed);color:#fff;border:0;border-radius:8px;padding:9px 16px;font-weight:700;font-size:.85rem;cursor:pointer;font-family:inherit;">Play vs AI →</button>' +
        '</div>';
    }

    card.innerHTML =
      '<div class="ar-lob-main">' +
        '<div class="ar-lob-h">' +
          '<div class="ar-lob-t">' + escapeHtml(r.gameEmoji||'🎮') + ' ' + escapeHtml(r.gameName||'Match') + ' <span class="ar-lob-fmt">' + escapeHtml(r.formatEmoji||'') + ' ' + escapeHtml(r.formatName||'') + '</span></div>' +
          '<button class="ar-mod-x" onclick="ArenaWiring.leaveLobby()">×</button>' +
        '</div>' +
        '<div style="font-size:.82rem;color:rgba(255,255,255,.6);margin-bottom:10px;">Hosted by ' + escapeHtml(r.hostName||'Player') + ' · 🎁 GH₵' + ((r.prize||0).toLocaleString()) + '</div>' +
        '<div class="ar-lob-team"><h4><span>Players</span><span>' + ((r.players||[]).length) + ' / ' + (r.maxPlayers||2) + '</span></h4>' + slotsHtml + '</div>' +
        aiSection +
        '<div style="display:flex;gap:8px;margin-top:14px;">' +
          '<button class="ar-cta" style="flex:1" onclick="ArenaWiring.toggleReady(\'' + roomId + '\')">' + (meEntry && meEntry.ready ? '✓ Ready' : 'Mark Ready') + '</button>' +
          (canStart ? '<button class="ar-cta" style="flex:1;background:linear-gradient(135deg,#10b981,#059669)" onclick="ArenaWiring.startMatch(\'' + roomId + '\')">Start →</button>' : '') +
        '</div>' +
      '</div>' +
      '<aside class="ar-lob-chat">' +
        '<div class="ar-lob-chat-h">💬 Lobby chat</div>' +
        '<div class="ar-lob-feed" id="arLobFeedCloud"></div>' +
        '<div class="ar-lob-input">' +
          '<input id="arLobChatInCloud" placeholder="Say hi… (no phone numbers, links, etc — auto-redacted)" onkeydown="if(event.key===\'Enter\') ArenaWiring.sendChat(\'' + roomId + '\')">' +
          '<button onclick="ArenaWiring.sendChat(\'' + roomId + '\')">→</button>' +
        '</div>' +
      '</aside>';

    // Hook chat after re-render
    bindLobbyChat(roomId);

    // If status flipped to 'live', open game runner
    if (r.status === 'live'){
      openCloudGame(roomId);
    }
  }

  unsubRoom = window.LTRealtime.subscribeRoom(roomId, function(r){
    if (!r){
      card.innerHTML = '<div style="padding:40px;text-align:center;color:rgba(255,255,255,.6);">Room ended.</div>';
      setTimeout(function(){ m.remove(); if (unsubRoom) unsubRoom(); }, 2000);
      return;
    }
    roomData = r;
    render();
  });

  // Track for cleanup
  m.__cleanup = function(){
    if (unsubRoom) try { unsubRoom(); } catch(e){}
    if (lastUnsubLobbyChat){ try { lastUnsubLobbyChat(); } catch(e){} lastUnsubLobbyChat = null; }
  };
}

function bindLobbyChat(roomId){
  if (lastUnsubLobbyChat){ try { lastUnsubLobbyChat(); } catch(e){} }
  lastUnsubLobbyChat = window.LTRealtime.subscribeChat(roomId, 'lobby', function(msgs){
    var feed = document.getElementById('arLobFeedCloud');
    if (!feed) return;
    var me = (window.LTAuth && window.LTAuth.user) ? window.LTAuth.user.uid : null;
    feed.innerHTML = msgs.map(function(m){
      if (m.sys) return '<div class="ar-lob-msg sys">' + escapeHtml(m.text) + '</div>';
      var mine = m.uid === me;
      var aiBadge = m.isAI ? ' <span style="color:#a78bfa;font-size:.7rem;font-weight:700;">AI</span>' : '';
      return '<div class="ar-lob-msg ' + (mine ? 'me' : '') + '"><b>' + escapeHtml(m.name||'') + aiBadge + '</b>' + escapeHtml(m.text||'') + '</div>';
    }).join('');
    feed.scrollTop = feed.scrollHeight;
  });
}

window.ArenaWiring.toggleReady = async function(roomId){
  try { await window.LTRealtime.markReady(roomId, true); } catch(e){}
  // Toggle handled by next snapshot
};

window.ArenaWiring.startMatch = async function(roomId){
  try { await window.LTRealtime.startMatch(roomId); } catch(e){ alert('Could not start: ' + e.message); }
};

window.ArenaWiring.spawnAI = async function(roomId){
  try { await window.LTRealtime.spawnAIOpponent(roomId); } catch(e){ alert('Could not add AI: ' + e.message); }
};

window.ArenaWiring.sendChat = async function(roomId){
  var input = document.getElementById('arLobChatInCloud');
  if (!input) return;
  var text = (input.value || '').trim();
  if (!text) return;
  input.value = '';
  try { await window.LTRealtime.sendChat(roomId, 'lobby', text); }
  catch(e){ console.warn('chat send', e); }
};

window.ArenaWiring.leaveLobby = async function(){
  if (currentRoomId){
    try { await window.LTRealtime.leaveRoom(currentRoomId); } catch(e){}
  }
  var m = document.getElementById('arCloudLobby');
  if (m){ if (m.__cleanup) m.__cleanup(); m.remove(); }
  currentRoomId = null;
};

// ────────────────────────────────────────────────────────────────
// 4. Cloud-aware spectator
// ────────────────────────────────────────────────────────────────
function openCloudSpectate(roomId){
  document.querySelectorAll('.ar-modal,#arGameModal,#arLobbyModal,#arCloudLobby,#arCloudSpec').forEach(function(n){ n.remove(); });
  if (lastUnsubSpecChat){ try { lastUnsubSpecChat(); } catch(e){} lastUnsubSpecChat = null; }

  var m = document.createElement('div');
  m.className = 'ar-modal';
  m.id = 'arCloudSpec';
  m.innerHTML = '<div class="ar-lobby-card" style="min-height:540px"></div>';
  document.body.appendChild(m);
  var card = m.querySelector('.ar-lobby-card');

  var roomData = null;
  var scoreHistory = {}; // uid -> [scores over time]

  function render(){
    if (!roomData){
      card.innerHTML = '<div style="padding:40px;text-align:center;color:rgba(255,255,255,.6);">Loading match…</div>';
      return;
    }
    var r = roomData;
    var since = r.startedAt ? Math.max(1, Math.floor((Date.now() - r.startedAt) / 1000)) : 0;

    // Sort players by score
    var sorted = (r.players||[]).slice().sort(function(a,b){
      return (r.scores && r.scores[b.uid]||0) - (r.scores && r.scores[a.uid]||0);
    });
    var leader = sorted[0];
    var leaderScore = leader && r.scores ? (r.scores[leader.uid] || 0) : 0;

    var playerRows = sorted.map(function(p, i){
      var s = (r.scores && r.scores[p.uid]) || 0;
      var pctOfLeader = leaderScore > 0 ? Math.round((s / leaderScore) * 100) : 0;
      var rankEmoji = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '#' + (i+1);
      return '<div class="ar-spec-row">' +
        '<div style="font-weight:800">' + rankEmoji + '</div>' +
        '<div style="font-size:1.4rem">' + escapeHtml(p.avatar||'🙂') + '</div>' +
        '<div>' +
          '<div style="font-weight:700">' + escapeHtml(p.name||'') + (p.isAI ? ' <span style="color:#a78bfa;font-size:.72rem;font-weight:700;">AI</span>' : '') + '</div>' +
          '<div style="font-size:.72rem;color:rgba(255,255,255,.55)">' + escapeHtml(p.state||'') + '</div>' +
          '<div style="height:5px;background:rgba(255,255,255,.06);border-radius:3px;margin-top:4px;overflow:hidden;">' +
            '<div style="height:100%;width:' + pctOfLeader + '%;background:linear-gradient(to right,#fbbf24,#f97316);transition:width .4s;"></div>' +
          '</div>' +
        '</div>' +
        '<div style="text-align:right;font-weight:800;color:#fbbf24;font-family:\'Bricolage Grotesque\',sans-serif;font-size:1.1rem;">' + s + '</div>' +
        '<div style="text-align:right;font-size:.7rem;color:rgba(255,255,255,.5)">pts</div>' +
      '</div>';
    }).join('');

    card.innerHTML =
      '<div class="ar-lob-main">' +
        '<div class="ar-lob-h">' +
          '<div class="ar-lob-t">' +
            '<span class="ar-live-badge"><span class="ar-live-dot"></span> Live</span> ' +
            escapeHtml(r.gameEmoji||'🎮') + ' ' + escapeHtml(r.gameName||'Match') +
          '</div>' +
          '<button class="ar-mod-x" onclick="ArenaWiring.leaveSpec()">×</button>' +
        '</div>' +
        '<div style="display:flex;gap:14px;font-size:.82rem;color:rgba(255,255,255,.65);margin-bottom:14px;">' +
          '<span>⏱ ' + since + 's elapsed</span>' +
          '<span>👁 ' + (r.viewers||1) + ' watching</span>' +
          '<span>🎁 GH₵' + ((r.prize||0).toLocaleString()) + '</span>' +
        '</div>' +
        '<div class="ar-spec-rows">' + playerRows + '</div>' +
        (r.status === 'finished' ? '<div style="margin-top:14px;padding:14px;background:rgba(16,185,129,.15);border-radius:10px;text-align:center;font-weight:800;color:#6ee7b7;">🏆 Match finished! Winner: ' + escapeHtml((r.players||[]).find(function(p){ return p.uid === r.winnerUid; }) ? (r.players||[]).find(function(p){ return p.uid === r.winnerUid; }).name : '—') + '</div>' : '') +
      '</div>' +
      '<aside class="ar-lob-chat">' +
        '<div class="ar-lob-chat-h">💬 Spectator chat</div>' +
        '<div class="ar-lob-feed" id="arSpecFeedCloud"></div>' +
        '<div class="ar-lob-input">' +
          '<input id="arSpecChatInCloud" placeholder="Cheer them on…" onkeydown="if(event.key===\'Enter\') ArenaWiring.sendSpecChat(\'' + roomId + '\')">' +
          '<button onclick="ArenaWiring.sendSpecChat(\'' + roomId + '\')">→</button>' +
        '</div>' +
      '</aside>';

    bindSpecChat(roomId);
  }

  var unsubRoom = window.LTRealtime.subscribeRoom(roomId, function(r){
    if (!r){
      card.innerHTML = '<div style="padding:40px;text-align:center;color:rgba(255,255,255,.6);">Match ended.</div>';
      setTimeout(function(){ m.remove(); if (unsubRoom) unsubRoom(); }, 3000);
      return;
    }
    // Track score history for UI sparkline (future)
    if (r.scores){
      Object.keys(r.scores).forEach(function(uid){
        scoreHistory[uid] = scoreHistory[uid] || [];
        var last = scoreHistory[uid][scoreHistory[uid].length - 1];
        if (last !== r.scores[uid]) scoreHistory[uid].push(r.scores[uid]);
      });
    }
    roomData = r;
    render();
  });

  // Bump viewer count
  // (best-effort; if it fails due to perms, no big deal)

  m.__cleanup = function(){
    if (unsubRoom) try { unsubRoom(); } catch(e){}
    if (lastUnsubSpecChat){ try { lastUnsubSpecChat(); } catch(e){} lastUnsubSpecChat = null; }
  };
}

function bindSpecChat(roomId){
  if (lastUnsubSpecChat){ try { lastUnsubSpecChat(); } catch(e){} }
  lastUnsubSpecChat = window.LTRealtime.subscribeChat(roomId, 'spec', function(msgs){
    var feed = document.getElementById('arSpecFeedCloud');
    if (!feed) return;
    var me = (window.LTAuth && window.LTAuth.user) ? window.LTAuth.user.uid : null;
    feed.innerHTML = msgs.map(function(m){
      var mine = m.uid === me;
      return '<div class="ar-lob-msg ' + (mine ? 'me' : '') + '"><b>' + escapeHtml(m.name||'') + '</b>' + escapeHtml(m.text||'') + '</div>';
    }).join('');
    feed.scrollTop = feed.scrollHeight;
  });
}

window.ArenaWiring.sendSpecChat = async function(roomId){
  var input = document.getElementById('arSpecChatInCloud');
  if (!input) return;
  var text = (input.value || '').trim();
  if (!text) return;
  input.value = '';
  try { await window.LTRealtime.sendChat(roomId, 'spec', text); } catch(e){ console.warn(e); }
};

window.ArenaWiring.leaveSpec = function(){
  var m = document.getElementById('arCloudSpec');
  if (m){ if (m.__cleanup) m.__cleanup(); m.remove(); }
};

// ────────────────────────────────────────────────────────────────
// 5. Cloud-aware game runner — when match goes 'live', play questions
//    and publish scores to Firestore. AI opponent answers in parallel.
// ────────────────────────────────────────────────────────────────
function openCloudGame(roomId){
  // Close lobby modal first
  var lob = document.getElementById('arCloudLobby');
  if (lob){ if (lob.__cleanup) lob.__cleanup(); lob.remove(); }

  // For now, fall back to the original game modal which handles the
  // gameplay UX. We sync scores in the background.
  // (Future: full custom multiplayer-aware game runner.)

  // Subscribe to the room and use a simple question runner.
  var card = document.createElement('div');
  card.className = 'ar-modal';
  card.id = 'arCloudGame';
  card.innerHTML = '<div class="ar-lobby-card" style="min-height:480px;text-align:center;padding:30px;">' +
    '<h2 style="font-family:\'Bricolage Grotesque\',sans-serif;color:#fff;margin:0 0 8px;">🎮 Match starting!</h2>' +
    '<div id="arGameStatus" style="color:rgba(255,255,255,.7);margin-bottom:20px;">Get ready…</div>' +
    '<div id="arGameArea"></div>' +
  '</div>';
  document.body.appendChild(card);

  // Simple quiz runner
  var QUESTIONS = makeQuestionsForRoom();
  var qIdx = 0;
  var myScore = 0;
  var unsubRoom = null;

  function showQuestion(){
    if (qIdx >= QUESTIONS.length){
      // Match over
      finalizeMatch();
      return;
    }
    var q = QUESTIONS[qIdx];
    var area = document.getElementById('arGameArea');
    if (!area) return;
    area.innerHTML =
      '<div style="font-size:.8rem;color:rgba(255,255,255,.5);margin-bottom:6px;">Question ' + (qIdx+1) + ' of ' + QUESTIONS.length + '</div>' +
      '<div style="font-size:1.1rem;font-weight:700;color:#fff;margin-bottom:14px;">' + escapeHtml(q.q) + '</div>' +
      '<div style="display:grid;gap:8px;">' +
        q.opts.map(function(o, i){
          return '<button data-i="' + i + '" class="ar-q-opt" style="padding:14px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:#fff;border-radius:10px;font-family:inherit;font-size:.95rem;font-weight:600;cursor:pointer;text-align:left;">' + escapeHtml(o) + '</button>';
        }).join('') +
      '</div>' +
      '<div id="arQFeedback" style="margin-top:12px;font-weight:700;text-align:center;"></div>';
    area.querySelectorAll('.ar-q-opt').forEach(function(b){
      b.onclick = function(){
        var i = parseInt(b.getAttribute('data-i'));
        var fb = document.getElementById('arQFeedback');
        area.querySelectorAll('.ar-q-opt').forEach(function(x){ x.disabled = true; x.style.opacity = '.6'; });
        if (i === q.a){
          myScore += 100;
          b.style.background = 'rgba(16,185,129,.25)';
          b.style.borderColor = '#10b981';
          if (fb) fb.innerHTML = '<span style="color:#10b981;">✓ Correct! +100</span>';
        } else {
          b.style.background = 'rgba(220,38,38,.25)';
          b.style.borderColor = '#dc2626';
          if (fb) fb.innerHTML = '<span style="color:#fca5a5;">✗ Right answer: ' + escapeHtml(q.opts[q.a]) + '</span>';
        }
        // Publish my score
        window.LTRealtime.publishScore(roomId, myScore).catch(function(){});
        // Spawn AI answers for any AI players
        triggerAIAnswers(q);
        // Next question after 1.5s
        setTimeout(function(){ qIdx++; showQuestion(); }, 1500);
      };
    });
  }

  async function triggerAIAnswers(q){
    var unsub = window.LTRealtime.subscribeRoom(roomId, async function(r){
      unsub();
      if (!r) return;
      var aiPlayers = (r.players||[]).filter(function(p){ return p.isAI; });
      for (var i = 0; i < aiPlayers.length; i++){
        var ai = aiPlayers[i];
        var res = await window.LTRealtime.aiAnswerQuestion(q.q, q.opts, q.a, { accuracy: 0.72 });
        var prevScore = (r.scores && r.scores[ai.uid]) || 0;
        var newScore = prevScore + (res.correct ? 100 : 0);
        try { await window.LTRealtime.updateAIScore(roomId, ai.uid, newScore); } catch(e){}
      }
    });
  }

  async function finalizeMatch(){
    var area = document.getElementById('arGameArea');
    var status = document.getElementById('arGameStatus');
    if (status) status.textContent = 'Match complete';
    // Determine winner from latest room state
    var unsub = window.LTRealtime.subscribeRoom(roomId, async function(r){
      unsub();
      if (!r) return;
      var sorted = (r.players||[]).slice().sort(function(a,b){
        return ((r.scores||{})[b.uid]||0) - ((r.scores||{})[a.uid]||0);
      });
      var winner = sorted[0];
      var me = (window.LTAuth && window.LTAuth.user) ? window.LTAuth.user.uid : null;
      var iWon = winner && winner.uid === me;
      if (area){
        area.innerHTML =
          '<div style="font-size:3rem;margin:10px 0;">' + (iWon ? '🏆' : '🥈') + '</div>' +
          '<div style="font-size:1.4rem;font-weight:800;color:#fff;margin-bottom:10px;">' + (iWon ? 'You won!' : 'Good game') + '</div>' +
          '<div style="color:rgba(255,255,255,.7);margin-bottom:20px;">Your score: <b style="color:#fbbf24">' + myScore + '</b></div>' +
          '<button onclick="document.getElementById(\'arCloudGame\').remove()" style="background:#3b82f6;color:#fff;border:0;border-radius:9px;padding:10px 22px;font-weight:700;cursor:pointer;font-family:inherit;">Done</button>';
      }
      // Mark match finished (host only)
      var amHost = (window.LTAuth && window.LTAuth.user) ? r.hostUid === window.LTAuth.user.uid : false;
      if (amHost){
        try { await window.LTRealtime.endMatch(roomId, winner ? winner.uid : null); } catch(e){}
      }
      // Record locally for XP / parent dashboard
      if (window._sessionProgress && window.recordQuizResult){
        try {
          window.recordQuizResult('Live Arena', r.gameName || 'Match', Math.floor(myScore/100), QUESTIONS.length);
        } catch(e){}
      }
    });
  }

  setTimeout(showQuestion, 1500);
}

// Generate ~5 questions appropriate to the room. Reuses existing
// arena question bank if available, else generic mix.
function makeQuestionsForRoom(){
  var FALLBACK = [
    { q: 'What is 12 × 9?', opts: ['98','108','118','128'], a: 1 },
    { q: 'Capital of Ghana?', opts: ['Accra','Tamale','Kumasi','Cape Coast'], a: 0 },
    { q: 'Past tense of "go"?', opts: ['goed','went','gone','goes'], a: 1 },
    { q: 'H₂O is ___?', opts: ['Salt','Acid','Water','Oxygen'], a: 2 },
    { q: '50% of 240?', opts: ['100','110','120','130'], a: 2 }
  ];
  if (typeof window.getQuestionBank === 'function'){
    try {
      var bank = window.getQuestionBank('quiz', 'seniors');
      if (bank && bank.length) return bank.slice(0, 5);
    } catch(e){}
  }
  return FALLBACK;
}

// ────────────────────────────────────────────────────────────────
// 6. Lobby chat — patched into the original lobby flow if cloud
//    isn't being used (legacy fallback path)
// ────────────────────────────────────────────────────────────────
function patchLobbyChat(){
  // The original ArenaLobby.send already exists; we don't need to
  // override it because openCloudLobby fully replaces openLobby for
  // cloud-backed rooms.
}

function escapeHtml(s){
  return String(s||'').replace(/[&<>"']/g, function(c){
    return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
  });
}

})();
