/* ════════════════════════════════════════════════════════════════
   FIREBASE-REALTIME — live rooms, chat, and AI-opponent fallback
   ────────────────────────────────────────────────────────────────
   Replaces the bot/fake-data layer in arena-0.js with real Firestore
   data. When no human is available within waitMs, uses the AI proxy
   (/api/openai or /api/anthropic) to spawn an "AI Tutor" opponent
   that plays a real game (gets the same questions, gives real
   answers, has a thinking delay).

   Public API:
     LTRealtime.listRoomsLive(filters, callback) → unsubscribe
     LTRealtime.createRoom(roomData) → roomId
     LTRealtime.joinRoom(roomId, player) → unsubscribe
     LTRealtime.startMatch(roomId) → null
     LTRealtime.publishScore(roomId, uid, score) → null
     LTRealtime.subscribeChat(roomId, kind, cb) → unsubscribe
     LTRealtime.sendChat(roomId, kind, text) → null
     LTRealtime.spawnAIOpponent(room) → null
     LTRealtime.subscribeDM(threadId, cb) → unsubscribe
     LTRealtime.sendDM(threadId, recipientUid, text) → null

   Firestore shape:
     arena_rooms/{roomId}                 — room doc (status, players, scores)
     arena_rooms/{roomId}/lobbyChat/{id}  — pre-game chat
     arena_rooms/{roomId}/specChat/{id}   — spectator chat
     dm_threads/{threadId}                — DM thread (a, b, lastAt)
     dm_threads/{threadId}/messages/{id}  — DM messages
   ════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

// Placeholder so callers don't break before firebase-0.js loads.
var LTRealtime = {
  ready: false,
  listRoomsLive: function(){ return function(){}; },
  createRoom: function(){ return Promise.reject(new Error('Realtime not ready')); },
  joinRoom: function(){ return Promise.resolve(function(){}); },
  leaveRoom: function(){ return Promise.resolve(); },
  startMatch: function(){ return Promise.resolve(); },
  publishScore: function(){ return Promise.resolve(); },
  subscribeChat: function(){ return function(){}; },
  sendChat: function(){ return Promise.resolve(); },
  spawnAIOpponent: function(){ return Promise.resolve(); },
  subscribeDM: function(){ return function(){}; },
  sendDM: function(){ return Promise.resolve(); }
};
window.LTRealtime = LTRealtime;

// Wait for firebase-0.js to load and expose LTAuth/LTCloud.
window.addEventListener('lt-firebase-ready', async function(e){
  if (!e || !e.detail || !e.detail.enabled) return;
  try { await initRealtime(); } catch(err){ console.error('[LTRealtime] init failed', err); }
});

async function initRealtime(){
  // We import the SDK directly so this module is self-contained.
  // (firebase-0.js initialised the app already; we just need handles.)
  var FsMod = await import('https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js');
  var AppMod = await import('https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js');
  var app = AppMod.getApp(); // already initialised by firebase-0.js
  var db = FsMod.getFirestore(app);

  var doc            = FsMod.doc;
  var setDoc         = FsMod.setDoc;
  var addDoc         = FsMod.addDoc;
  var getDoc         = FsMod.getDoc;
  var updateDoc      = FsMod.updateDoc;
  var deleteDoc      = FsMod.deleteDoc;
  var collection     = FsMod.collection;
  var query          = FsMod.query;
  var where          = FsMod.where;
  var orderBy        = FsMod.orderBy;
  var limit          = FsMod.limit;
  var getDocs        = FsMod.getDocs;
  var onSnapshot     = FsMod.onSnapshot;
  var serverTimestamp = FsMod.serverTimestamp;
  var arrayUnion     = FsMod.arrayUnion;
  var arrayRemove    = FsMod.arrayRemove;

  function uid(){ return 'r_' + Math.random().toString(36).slice(2,10); }

  function authUid(){
    if (window.LTAuth && window.LTAuth.user) return window.LTAuth.user.uid;
    // Fallback for guests — generate a stable per-session id
    try {
      var s = sessionStorage.getItem('lt_guest_uid');
      if (!s){ s = 'guest_' + Math.random().toString(36).slice(2,10); sessionStorage.setItem('lt_guest_uid', s); }
      return s;
    } catch(e){ return 'guest_' + Math.random().toString(36).slice(2,10); }
  }

  function authProfile(){
    var p = window._LT_LAST_PROFILE || {};
    var arenaP = (window.ArenaDB && window.ArenaDB.loadProfile && window.ArenaDB.loadProfile()) || {};
    return {
      uid: authUid(),
      name: p.name || arenaP.name || 'Player',
      avatar: arenaP.avatar || '🦁',
      classGroup: arenaP.classGroup || 'seniors',
      state: p.state || arenaP.state || '',
      school: p.school || arenaP.school || ''
    };
  }

  // ───────────────────────────────────────────────────────────
  // ROOMS
  // ───────────────────────────────────────────────────────────
  // Filters: { classGroup, scope, format? }
  // cb(rooms) called whenever the listing changes.
  LTRealtime.listRoomsLive = function(filters, cb){
    filters = filters || {};
    var clauses = [
      where('status', 'in', ['open','live']),
      where('classGroup', '==', filters.classGroup || 'seniors'),
      where('scope', '==', filters.scope || 'local')
    ];
    if (filters.format && filters.format !== 'any'){
      clauses.push(where('format', '==', filters.format));
    }
    var qref = query.apply(null, [collection(db, 'arena_rooms')].concat(clauses).concat([
      orderBy('createdAt', 'desc'),
      limit(30)
    ]));
    var unsub = onSnapshot(qref, function(snap){
      var rows = [];
      snap.forEach(function(d){ rows.push(Object.assign({ id:d.id }, d.data())); });
      cb(rows);
    }, function(err){
      console.warn('[LTRealtime] room listing error', err);
      cb([]);
    });
    return unsub;
  };

  LTRealtime.createRoom = async function(roomData){
    var me = authProfile();
    var id = uid();
    var data = Object.assign({
      id: id,
      hostUid: me.uid,
      hostName: me.name,
      classGroup: 'seniors',
      scope: 'local',
      state: null,
      gameId: 'quiz',
      gameName: 'Quiz Duel',
      gameEmoji: '🧠',
      duration: '3 min',
      format: 'duo',
      formatName: '1v1 Duo',
      formatEmoji: '⚔️',
      maxPlayers: 2,
      teamSize: 1,
      players: [{ uid: me.uid, name: me.name, avatar: me.avatar, state: me.state, ready: false, isAI: false }],
      scores: {},
      status: 'open',
      viewers: 0,
      prize: 500,
      createdAt: Date.now(),
      updatedAt: serverTimestamp()
    }, roomData || {});
    await setDoc(doc(db, 'arena_rooms', id), data);
    // Auto-cleanup: schedule deletion if abandoned. Best-effort client-side.
    setTimeout(function(){ cleanupIfStale(id); }, 5 * 60 * 1000);
    return id;
  };

  async function cleanupIfStale(roomId){
    try {
      var snap = await getDoc(doc(db, 'arena_rooms', roomId));
      if (!snap.exists()) return;
      var d = snap.data();
      // If room is still 'open' after 5 minutes with only the host, delete it
      if (d.status === 'open' && (d.players||[]).length <= 1){
        var human = (d.players||[]).filter(function(p){ return !p.isAI; });
        if (human.length <= 1) await deleteDoc(doc(db, 'arena_rooms', roomId));
      }
    } catch(e){}
  }

  LTRealtime.subscribeRoom = function(roomId, cb){
    return onSnapshot(doc(db, 'arena_rooms', roomId), function(snap){
      if (!snap.exists()){ cb(null); return; }
      cb(Object.assign({ id:snap.id }, snap.data()));
    });
  };

  LTRealtime.joinRoom = async function(roomId){
    var me = authProfile();
    var ref = doc(db, 'arena_rooms', roomId);
    var snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('Room no longer exists');
    var d = snap.data();
    var already = (d.players||[]).some(function(p){ return p.uid === me.uid; });
    if (!already){
      if ((d.players||[]).length >= (d.maxPlayers || 2)) throw new Error('Room is full');
      await updateDoc(ref, {
        players: arrayUnion({ uid: me.uid, name: me.name, avatar: me.avatar, state: me.state, ready: false, isAI: false }),
        updatedAt: serverTimestamp()
      });
    }
  };

  LTRealtime.leaveRoom = async function(roomId){
    var me = authProfile();
    var ref = doc(db, 'arena_rooms', roomId);
    try {
      var snap = await getDoc(ref);
      if (!snap.exists()) return;
      var d = snap.data();
      var player = (d.players||[]).find(function(p){ return p.uid === me.uid; });
      if (player){
        await updateDoc(ref, {
          players: arrayRemove(player),
          updatedAt: serverTimestamp()
        });
      }
      // If last human leaves, delete the room
      var remaining = (d.players||[]).filter(function(p){ return p.uid !== me.uid && !p.isAI; });
      if (remaining.length === 0) await deleteDoc(ref);
    } catch(e){}
  };

  LTRealtime.markReady = async function(roomId, ready){
    var me = authProfile();
    var ref = doc(db, 'arena_rooms', roomId);
    var snap = await getDoc(ref);
    if (!snap.exists()) return;
    var d = snap.data();
    var newPlayers = (d.players||[]).map(function(p){
      if (p.uid === me.uid) return Object.assign({}, p, { ready: !!ready });
      return p;
    });
    await updateDoc(ref, { players: newPlayers, updatedAt: serverTimestamp() });
  };

  LTRealtime.startMatch = async function(roomId){
    await updateDoc(doc(db, 'arena_rooms', roomId), {
      status: 'live',
      startedAt: Date.now(),
      updatedAt: serverTimestamp()
    });
  };

  LTRealtime.publishScore = async function(roomId, score){
    var me = authProfile();
    var ref = doc(db, 'arena_rooms', roomId);
    var snap = await getDoc(ref);
    if (!snap.exists()) return;
    var d = snap.data();
    var scores = Object.assign({}, d.scores||{});
    scores[me.uid] = score;
    await updateDoc(ref, { scores: scores, updatedAt: serverTimestamp() });
  };

  LTRealtime.endMatch = async function(roomId, winnerUid){
    await updateDoc(doc(db, 'arena_rooms', roomId), {
      status: 'finished',
      winnerUid: winnerUid || null,
      finishedAt: Date.now(),
      updatedAt: serverTimestamp()
    });
    // Clean up after 10 min
    setTimeout(function(){
      deleteDoc(doc(db, 'arena_rooms', roomId)).catch(function(){});
    }, 10 * 60 * 1000);
  };

  // ───────────────────────────────────────────────────────────
  // CHAT (lobby + spectator + DMs)
  // ───────────────────────────────────────────────────────────
  // kind: 'lobby' | 'spec'
  LTRealtime.subscribeChat = function(roomId, kind, cb){
    var sub = (kind === 'spec') ? 'specChat' : 'lobbyChat';
    var qref = query(
      collection(db, 'arena_rooms', roomId, sub),
      orderBy('at', 'asc'),
      limit(100)
    );
    return onSnapshot(qref, function(snap){
      var msgs = [];
      snap.forEach(function(d){ msgs.push(Object.assign({ id:d.id }, d.data())); });
      cb(msgs);
    }, function(err){
      console.warn('[LTRealtime] chat sub error', err);
    });
  };

  LTRealtime.sendChat = async function(roomId, kind, text){
    var me = authProfile();
    if (!text || !text.trim()) return;
    // Filter personal info using the existing SocialDB filter
    var f = (window.SocialDB && window.SocialDB.filter) ? window.SocialDB.filter(text) : { clean: text, hits: [] };
    if (!f.clean.trim()) return;
    var sub = (kind === 'spec') ? 'specChat' : 'lobbyChat';
    await addDoc(collection(db, 'arena_rooms', roomId, sub), {
      uid: me.uid,
      name: me.name,
      avatar: me.avatar,
      text: f.clean,
      redacted: f.hits && f.hits.length > 0,
      at: Date.now(),
      atServer: serverTimestamp()
    });
  };

  // ── DMs (direct messages between students in same class group) ──
  function dmThreadKey(a, b){
    return [a, b].sort().join('__');
  }
  LTRealtime.openOrCreateDMThread = async function(otherUid, otherProfile){
    var me = authProfile();
    if (otherUid === me.uid) throw new Error('Cannot DM yourself');
    // Permission: same class group
    if (otherProfile && otherProfile.classGroup && me.classGroup && otherProfile.classGroup !== me.classGroup){
      throw new Error('You can only DM students in the same class group.');
    }
    var threadId = dmThreadKey(me.uid, otherUid);
    var ref = doc(db, 'dm_threads', threadId);
    var snap = await getDoc(ref);
    if (!snap.exists()){
      await setDoc(ref, {
        id: threadId,
        a: me.uid, b: otherUid,
        members: [me.uid, otherUid],
        aName: me.name, bName: (otherProfile && otherProfile.name) || '',
        aAvatar: me.avatar, bAvatar: (otherProfile && otherProfile.avatar) || '🙂',
        lastAt: Date.now(),
        createdAt: serverTimestamp()
      });
    }
    return threadId;
  };

  LTRealtime.subscribeDM = function(threadId, cb){
    var qref = query(
      collection(db, 'dm_threads', threadId, 'messages'),
      orderBy('at', 'asc'),
      limit(200)
    );
    return onSnapshot(qref, function(snap){
      var msgs = [];
      snap.forEach(function(d){ msgs.push(Object.assign({ id:d.id }, d.data())); });
      cb(msgs);
    });
  };

  LTRealtime.sendDM = async function(threadId, text){
    var me = authProfile();
    if (!text || !text.trim()) return;
    var f = (window.SocialDB && window.SocialDB.filter) ? window.SocialDB.filter(text) : { clean: text, hits: [] };
    if (!f.clean.trim()) return;
    await addDoc(collection(db, 'dm_threads', threadId, 'messages'), {
      from: me.uid,
      fromName: me.name,
      text: f.clean,
      redacted: f.hits.length > 0,
      at: Date.now()
    });
    try {
      await updateDoc(doc(db, 'dm_threads', threadId), { lastAt: Date.now(), lastText: f.clean.slice(0,80) });
    } catch(e){}
  };

  LTRealtime.listMyDMThreads = function(cb){
    var me = authProfile();
    var qref = query(
      collection(db, 'dm_threads'),
      where('members', 'array-contains', me.uid),
      orderBy('lastAt', 'desc'),
      limit(30)
    );
    return onSnapshot(qref, function(snap){
      var rows = [];
      snap.forEach(function(d){ rows.push(Object.assign({ id:d.id }, d.data())); });
      cb(rows);
    });
  };

  // ───────────────────────────────────────────────────────────
  // AI OPPONENT — when no human joins, spawn an AI Tutor that plays
  // a real match. We use the AI to generate answers in real-time.
  // ───────────────────────────────────────────────────────────
  LTRealtime.spawnAIOpponent = async function(roomId){
    var ref = doc(db, 'arena_rooms', roomId);
    var snap = await getDoc(ref);
    if (!snap.exists()) return;
    var d = snap.data();
    var me = authProfile();
    if (d.hostUid !== me.uid) return; // only host can spawn AI
    if ((d.players||[]).length >= (d.maxPlayers||2)) return;

    var aiUid = 'ai_' + Math.random().toString(36).slice(2,8);
    var aiNames = ['Tutor Kwame', 'Tutor Adwoa', 'Tutor Kojo', 'Tutor Ama', 'Tutor Yaw', 'Tutor Akosua'];
    var aiAvatars = ['🤖','🦉','🧠','✨','📚','🎓'];
    var aiName = aiNames[Math.floor(Math.random()*aiNames.length)];
    var aiAvatar = aiAvatars[Math.floor(Math.random()*aiAvatars.length)];

    await updateDoc(ref, {
      players: arrayUnion({
        uid: aiUid,
        name: aiName,
        avatar: aiAvatar,
        state: 'AI',
        ready: true,  // AI is always ready
        isAI: true
      }),
      updatedAt: serverTimestamp()
    });

    // Send a friendly chat message
    try {
      await addDoc(collection(db, 'arena_rooms', roomId, 'lobbyChat'), {
        uid: aiUid,
        name: aiName,
        avatar: aiAvatar,
        text: "Hi! I'm your AI study partner today. Ready when you are! 🎯",
        redacted: false,
        at: Date.now(),
        atServer: serverTimestamp(),
        isAI: true
      });
    } catch(e){}

    return { uid: aiUid, name: aiName, avatar: aiAvatar };
  };

  // Have the AI "play" a question — answers correctly with realistic accuracy.
  // Used by arena game runners. Returns a Promise<{correct, delayMs}>.
  LTRealtime.aiAnswerQuestion = async function(question, options, correctIdx, opts){
    opts = opts || {};
    // Realistic difficulty curve: AI gets ~75% right by default, with a
    // 1-3 second "thinking" delay so it feels like a player.
    var accuracy = opts.accuracy != null ? opts.accuracy : 0.75;
    var minDelay = opts.minDelay || 1200;
    var maxDelay = opts.maxDelay || 3500;
    var delay = minDelay + Math.random() * (maxDelay - minDelay);
    await new Promise(function(r){ setTimeout(r, delay); });

    // For text-only questions where we have options, just pick based on accuracy
    if (typeof correctIdx === 'number' && options && options.length){
      var roll = Math.random();
      if (roll < accuracy){
        return { pick: correctIdx, correct: true, delayMs: delay };
      } else {
        // Pick a wrong option
        var wrongs = options.map(function(_,i){return i;}).filter(function(i){return i !== correctIdx;});
        var pick = wrongs[Math.floor(Math.random()*wrongs.length)];
        return { pick: pick, correct: false, delayMs: delay };
      }
    }
    // Open-ended fallback (Spelling Bee, Word Builder): use AI proxy.
    try {
      var server = (function(){
        try { return localStorage.getItem('LT_SERVER') || 'auto'; } catch(e){ return 'auto'; }
      })();
      var endpoint = (server === '2') ? '/api/openai' : '/api/anthropic';
      var resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 80,
          system: 'You are an AI student playing a game. Answer the question with ONLY your single best answer, no explanations, no extra words. Be concise.',
          messages: [{ role:'user', content: question }]
        })
      });
      if (!resp.ok) throw new Error('AI call failed');
      var data = await resp.json();
      var text = '';
      if (data && data.content && data.content[0] && data.content[0].text) text = data.content[0].text.trim();
      else if (data && data.content) text = String(data.content).trim();
      return { pick: text, correct: null, delayMs: delay };
    } catch(e){
      return { pick: '', correct: false, delayMs: delay };
    }
  };

  // Update an AI player's score (helper for the wiring code).
  LTRealtime.updateAIScore = async function(roomId, aiUid, newScore){
    var ref = doc(db, 'arena_rooms', roomId);
    var snap = await getDoc(ref);
    if (!snap.exists()) return;
    var d = snap.data();
    var scores = Object.assign({}, d.scores||{});
    scores[aiUid] = newScore;
    await updateDoc(ref, { scores: scores, updatedAt: serverTimestamp() });
  };

  // ───────────────────────────────────────────────────────────
  // Mark ready
  LTRealtime.ready = true;
  console.log('[LTRealtime] ready');
  try { window.dispatchEvent(new CustomEvent('lt-realtime-ready')); } catch(e){}
}

})();
