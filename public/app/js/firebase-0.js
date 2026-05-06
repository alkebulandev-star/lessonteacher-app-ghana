/* ════════════════════════════════════════════════════════════════
   FIREBASE — auth + cloud data sync for Lesson Teacher
   ────────────────────────────────────────────────────────────────
   This file:
     1. Loads Firebase v9 modular SDK from the official CDN
     2. Initialises the app from `window.LT_FIREBASE_CONFIG` (set in
        index.html, see <script id="lt-firebase-config">). Without the
        config the app stays in offline / localStorage-only mode.
     3. Exposes two globals:
          window.LTAuth   — sign up / sign in / sign out / current user
          window.LTCloud  — read/write helpers for Firestore docs +
                            collections used by the rest of the app.
     4. Hooks the existing data layers (ArenaDB, SocialDB, parent state,
        _sessionProgress) so that when a user is signed in, all four
        get their data synced to / from Firestore. When the user is
        a guest (no auth) they keep using localStorage exactly as today.

   Collections used in Firestore:
     users/{uid}                — base profile (role, name, email, class…)
     users/{uid}/progress/main  — student's _sessionProgress doc
     users/{uid}/social/profile — student's SocialDB profile
     users/{uid}/parent/state   — parent hub state
     arena_leaders/{key}        — denormalised weekly leaderboard rows
     arena_profiles/{uid}       — arena profile snapshot
     parent_links/{linkId}      — { parentUid, childUid, status }
   ════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

// ───────────────────────────────────────────────────────────────
// 0. CONFIG & SDK BOOTSTRAP
// ───────────────────────────────────────────────────────────────
var LT_LOG = function(){
  if (window.LT_DEBUG_FIREBASE) {
    try { console.log.apply(console, ['[LT-FB]'].concat([].slice.call(arguments))); } catch(e){}
  }
};

var hasConfig = !!(window.LT_FIREBASE_CONFIG &&
                   window.LT_FIREBASE_CONFIG.apiKey &&
                   window.LT_FIREBASE_CONFIG.projectId);

// Public API placeholder — UI calls these regardless of whether Firebase
// loaded successfully. If it didn't, every method is a no-op that resolves.
var LTAuth = {
  ready: false,
  user: null,
  _listeners: [],
  onChange: function(fn){
    this._listeners.push(fn);
    try { fn(this.user); } catch(e){}
  },
  _emit: function(){
    var u = this.user;
    this._listeners.forEach(function(fn){ try { fn(u); } catch(e){} });
  },
  signUp: function(){ return Promise.reject(new Error('Firebase not configured')); },
  signIn: function(){ return Promise.reject(new Error('Firebase not configured')); },
  signInWithGoogle: function(){ return Promise.reject(new Error('Firebase not configured')); },
  signOut: function(){ return Promise.resolve(); },
  resetPassword: function(){ return Promise.reject(new Error('Firebase not configured')); },
  isSignedIn: function(){ return !!this.user; },
  uid: function(){ return this.user ? this.user.uid : null; }
};

var LTCloud = {
  ready: false,
  // Profile (the doc at users/{uid})
  saveProfile: function(){ return Promise.resolve(); },
  loadProfile: function(){ return Promise.resolve(null); },
  // Student progress
  saveProgress: function(){ return Promise.resolve(); },
  loadProgress: function(){ return Promise.resolve(null); },
  // Parent hub
  saveParentState: function(){ return Promise.resolve(); },
  loadParentState: function(){ return Promise.resolve(null); },
  // Parent ↔ child link by child email
  linkChildByEmail: function(){ return Promise.reject(new Error('Firebase not configured')); },
  unlinkChild: function(){ return Promise.resolve(); },
  listLinkedChildren: function(){ return Promise.resolve([]); },
  fetchChildProgress: function(){ return Promise.resolve(null); },
  // Social
  saveSocialProfile: function(){ return Promise.resolve(); },
  loadSocialProfile: function(){ return Promise.resolve(null); },
  listAllSocialProfiles: function(){ return Promise.resolve([]); },
  // Arena
  saveArenaProfile: function(){ return Promise.resolve(); },
  loadArenaProfile: function(){ return Promise.resolve(null); },
  publishMatch: function(){ return Promise.resolve(); },
  topLeaders: function(){ return Promise.resolve([]); }
};

window.LTAuth  = LTAuth;
window.LTCloud = LTCloud;

if (!hasConfig){
  LT_LOG('No firebase config — running in localStorage-only mode');
  // Fire a "ready" event so UI can stop spinners.
  try {
    window.dispatchEvent(new CustomEvent('lt-firebase-ready', { detail:{ enabled:false } }));
  } catch(e){}
  return;
}

// ───────────────────────────────────────────────────────────────
// 1. LOAD FIREBASE SDK + INIT
// ───────────────────────────────────────────────────────────────
// Using the modular v9 SDK via CDN. We import everything we need in
// one async block so the rest of the file can use top-level await
// patterns through promises.
var ready = (async function(){
  try {
    var [
      { initializeApp },
      AuthMod,
      FsMod
    ] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js')
    ]);

    var app  = initializeApp(window.LT_FIREBASE_CONFIG);
    var auth = AuthMod.getAuth(app);
    // Stable behaviour across reloads.
    try { await AuthMod.setPersistence(auth, AuthMod.browserLocalPersistence); } catch(e){}
    var db   = FsMod.getFirestore(app);

    // Convenience refs
    var doc            = FsMod.doc;
    var setDoc         = FsMod.setDoc;
    var getDoc         = FsMod.getDoc;
    var updateDoc      = FsMod.updateDoc;
    var deleteDoc      = FsMod.deleteDoc;
    var collection     = FsMod.collection;
    var addDoc         = FsMod.addDoc;
    var query          = FsMod.query;
    var where          = FsMod.where;
    var orderBy        = FsMod.orderBy;
    var limit          = FsMod.limit;
    var getDocs        = FsMod.getDocs;
    var serverTimestamp = FsMod.serverTimestamp;

    // ───────────────────────────────────────────────────────────
    // 2. AUTH
    // ───────────────────────────────────────────────────────────
    LTAuth.ready = true;

    // Keep a flat user object (uid + email + displayName) on LTAuth.user
    AuthMod.onAuthStateChanged(auth, function(fbUser){
      if (fbUser){
        LTAuth.user = {
          uid: fbUser.uid,
          email: fbUser.email,
          displayName: fbUser.displayName || ''
        };
      } else {
        LTAuth.user = null;
      }
      LTAuth._emit();
      // After sign-in, hydrate caches from cloud.
      if (fbUser) {
        cloudHydrate().catch(function(e){ LT_LOG('hydrate fail', e); });
      }
    });

    LTAuth.signUp = async function(email, password, profile){
      var cred = await AuthMod.createUserWithEmailAndPassword(auth, email, password);
      var uid = cred.user.uid;
      profile = profile || {};
      var docData = {
        uid: uid,
        email: email,
        role: profile.role || 'student',          // 'student' | 'parent'
        name: profile.name || '',
        section: profile.section || '',           // kids | primary | jss | sss
        classLevel: profile.classLevel || '',     // P3, JHS 2, SHS 2, etc.
        stream: profile.stream || '',             // science | arts | …
        school: profile.school || '',
        state: profile.state || '',
        createdAt: serverTimestamp()
      };
      await setDoc(doc(db, 'users', uid), docData);
      // Pre-create a social profile so DM/follow works immediately.
      await setDoc(doc(db, 'users', uid, 'social', 'profile'), {
        id: uid,
        name: docData.name,
        avatar: profile.avatar || '🦁',
        classGroup: classGroupFor(docData.section, docData.classLevel),
        school: docData.school,
        state: docData.state,
        fav: [],
        bio: profile.bio || '',
        joinedAt: Date.now()
      });
      try { await AuthMod.updateProfile(cred.user, { displayName: docData.name }); } catch(e){}
      return cred.user;
    };

    LTAuth.signIn = async function(email, password){
      var cred = await AuthMod.signInWithEmailAndPassword(auth, email, password);
      return cred.user;
    };

    // ── Google sign-in (popup). Falls back to redirect on small screens. ──
    LTAuth.signInWithGoogle = async function(rolePreference){
      var provider = new AuthMod.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      var cred;
      try {
        cred = await AuthMod.signInWithPopup(auth, provider);
      } catch(err){
        // popup-blocked or unsupported — try redirect
        if (err && /popup/i.test(err.code || err.message || '')){
          await AuthMod.signInWithRedirect(auth, provider);
          return null; // redirect will reload
        }
        throw err;
      }
      var fbUser = cred.user;
      var uid = fbUser.uid;
      // If profile already exists, just sign in. Otherwise pre-create a stub.
      var existing = await getDoc(doc(db, 'users', uid));
      if (!existing.exists()){
        var role = rolePreference === 'parent' ? 'parent' : 'student';
        var docData = {
          uid: uid,
          email: fbUser.email || '',
          role: role,
          name: fbUser.displayName || (fbUser.email||'').split('@')[0],
          section: '',
          classLevel: '',
          stream: '',
          school: '',
          state: '',
          needsOnboarding: role === 'student',  // student must pick level/class
          createdAt: serverTimestamp()
        };
        await setDoc(doc(db, 'users', uid), docData);
        await setDoc(doc(db, 'users', uid, 'social', 'profile'), {
          id: uid,
          name: docData.name,
          avatar: '🦁',
          classGroup: 'seniors',
          school: '',
          state: '',
          fav: [],
          bio: '',
          joinedAt: Date.now()
        });
      }
      return fbUser;
    };

    LTAuth.signOut = async function(){
      await AuthMod.signOut(auth);
    };

    LTAuth.resetPassword = async function(email){
      await AuthMod.sendPasswordResetEmail(auth, email);
    };

    // ───────────────────────────────────────────────────────────
    // 3. CLOUD HELPERS
    // ───────────────────────────────────────────────────────────
    function classGroupFor(section, classLevel){
      if (section === 'kids' || section === 'primary') return 'kids';
      if (section === 'jss')  return 'juniors';
      if (section === 'sss')  return 'seniors';
      // best-effort fallback
      var c = (classLevel||'').toUpperCase();
      if (c.indexOf('JHS') === 0) return 'juniors';
      if (c.indexOf('SS')  === 0) return 'seniors';
      if (c.indexOf('P')   === 0) return 'kids';
      return 'seniors';
    }

    LTCloud.ready = true;
    LTCloud.classGroupFor = classGroupFor;

    LTCloud.saveProfile = async function(patch){
      var uid = LTAuth.uid(); if (!uid) return;
      await setDoc(doc(db, 'users', uid), Object.assign({ updatedAt: serverTimestamp() }, patch||{}), { merge:true });
    };
    LTCloud.loadProfile = async function(){
      var uid = LTAuth.uid(); if (!uid) return null;
      var snap = await getDoc(doc(db, 'users', uid));
      return snap.exists() ? snap.data() : null;
    };

    // —— Student progress (mirrors window._sessionProgress)
    LTCloud.saveProgress = async function(progress){
      var uid = LTAuth.uid(); if (!uid) return;
      await setDoc(doc(db, 'users', uid, 'progress', 'main'),
        Object.assign({ updatedAt: serverTimestamp() }, progress||{}), { merge:true });
    };
    LTCloud.loadProgress = async function(){
      var uid = LTAuth.uid(); if (!uid) return null;
      var snap = await getDoc(doc(db, 'users', uid, 'progress', 'main'));
      return snap.exists() ? snap.data() : null;
    };

    // —— Parent hub state (mirrors window.LT_PH_STATE)
    LTCloud.saveParentState = async function(state){
      var uid = LTAuth.uid(); if (!uid) return;
      await setDoc(doc(db, 'users', uid, 'parent', 'state'),
        Object.assign({ updatedAt: serverTimestamp() }, state||{}), { merge:true });
    };
    LTCloud.loadParentState = async function(){
      var uid = LTAuth.uid(); if (!uid) return null;
      var snap = await getDoc(doc(db, 'users', uid, 'parent', 'state'));
      return snap.exists() ? snap.data() : null;
    };

    // —— Parent ↔ child link by the child's email
    LTCloud.linkChildByEmail = async function(childEmail){
      var uid = LTAuth.uid(); if (!uid) throw new Error('Sign in first');
      childEmail = String(childEmail||'').trim().toLowerCase();
      if (!childEmail) throw new Error('Email required');
      // Find child user by email
      var qSnap = await getDocs(query(collection(db, 'users'), where('email','==',childEmail), limit(1)));
      if (qSnap.empty) throw new Error('No student with that email');
      var childDoc = qSnap.docs[0];
      var childUid = childDoc.id;
      var childData = childDoc.data();
      if (childData.role && childData.role !== 'student') throw new Error('That account is not a student');
      // Save link (idempotent: linkId = parentUid + '_' + childUid)
      var linkId = uid + '_' + childUid;
      await setDoc(doc(db, 'parent_links', linkId), {
        parentUid: uid,
        childUid: childUid,
        childEmail: childEmail,
        childName: childData.name || '',
        status: 'active',
        createdAt: serverTimestamp()
      });
      return { childUid: childUid, childName: childData.name || childEmail, childData: childData };
    };

    LTCloud.unlinkChild = async function(childUid){
      var uid = LTAuth.uid(); if (!uid) return;
      try { await deleteDoc(doc(db, 'parent_links', uid + '_' + childUid)); } catch(e){}
    };

    LTCloud.listLinkedChildren = async function(){
      var uid = LTAuth.uid(); if (!uid) return [];
      var qSnap = await getDocs(query(collection(db, 'parent_links'), where('parentUid','==',uid)));
      var rows = [];
      qSnap.forEach(function(d){ rows.push(d.data()); });
      return rows;
    };

    LTCloud.fetchChildProgress = async function(childUid){
      // Parents can read their linked child's progress (rules enforce the link)
      try {
        var snap = await getDoc(doc(db, 'users', childUid, 'progress', 'main'));
        return snap.exists() ? snap.data() : null;
      } catch(e){ LT_LOG('fetchChildProgress', e); return null; }
    };

    // —— Social
    LTCloud.saveSocialProfile = async function(profile){
      var uid = LTAuth.uid(); if (!uid) return;
      await setDoc(doc(db, 'users', uid, 'social', 'profile'),
        Object.assign({ id: uid, updatedAt: serverTimestamp() }, profile||{}), { merge:true });
    };
    LTCloud.loadSocialProfile = async function(){
      var uid = LTAuth.uid(); if (!uid) return null;
      var snap = await getDoc(doc(db, 'users', uid, 'social', 'profile'));
      return snap.exists() ? snap.data() : null;
    };
    // Note: we keep the discovery list local-only for now (privacy), but we
    // could expose a flat collection for global discovery if needed.
    LTCloud.listAllSocialProfiles = async function(){
      // Best-effort: only return profiles whose users opted in via `discoverable:true`.
      try {
        var qSnap = await getDocs(query(collection(db, 'social_directory'), limit(50)));
        var rows = [];
        qSnap.forEach(function(d){ rows.push(d.data()); });
        return rows;
      } catch(e){ return []; }
    };

    // —— Arena
    LTCloud.saveArenaProfile = async function(p){
      var uid = LTAuth.uid(); if (!uid) return;
      await setDoc(doc(db, 'arena_profiles', uid),
        Object.assign({ uid: uid, updatedAt: serverTimestamp() }, p||{}), { merge:true });
    };
    LTCloud.loadArenaProfile = async function(){
      var uid = LTAuth.uid(); if (!uid) return null;
      var snap = await getDoc(doc(db, 'arena_profiles', uid));
      return snap.exists() ? snap.data() : null;
    };
    LTCloud.publishMatch = async function(match){
      // Update weekly leaderboard rows for each player.
      var wk = (function(d){ d=d||new Date(); var t=new Date(d.valueOf()); t.setHours(0,0,0,0); var day=(t.getDay()+6)%7; t.setDate(t.getDate()-day); return t.toISOString().slice(0,10); })();
      var ops = (match.players||[]).map(async function(pl){
        if (!pl.uid || pl.uid.indexOf('bot_') === 0) return; // only humans
        var key = pl.uid + '_' + match.classGroup + '_' + match.scope + '_' + wk;
        var ref = doc(db, 'arena_leaders', key);
        var snap = await getDoc(ref);
        var prev = snap.exists() ? snap.data() : { uid: pl.uid, name: pl.name, classGroup: match.classGroup, scope: match.scope, weekKey: wk, xp:0, wins:0, plays:0 };
        prev.xp    = (prev.xp || 0) + (pl.xp || 0);
        prev.plays = (prev.plays || 0) + 1;
        if (pl.uid === match.winnerUid) prev.wins = (prev.wins || 0) + 1;
        prev.name = pl.name;
        prev.updatedAt = serverTimestamp();
        await setDoc(ref, prev, { merge:true });
      });
      await Promise.all(ops);
    };
    LTCloud.topLeaders = async function(classGroup, scope, lim){
      var wk = (function(){ var t=new Date(); t.setHours(0,0,0,0); var day=(t.getDay()+6)%7; t.setDate(t.getDate()-day); return t.toISOString().slice(0,10); })();
      try {
        var clauses = [where('weekKey','==',wk), where('classGroup','==',classGroup)];
        if (scope && scope !== 'all') clauses.push(where('scope','==',scope));
        var qref = query.apply(null, [collection(db,'arena_leaders')].concat(clauses).concat([orderBy('xp','desc'), limit(lim||25)]));
        var snap = await getDocs(qref);
        var rows = [];
        snap.forEach(function(d){ rows.push(d.data()); });
        return rows;
      } catch(e){ LT_LOG('topLeaders', e); return []; }
    };

    // ───────────────────────────────────────────────────────────
    // 4. HYDRATE LOCAL CACHES FROM CLOUD ON SIGN-IN
    // ───────────────────────────────────────────────────────────
    async function cloudHydrate(){
      if (!LTAuth.uid()) return;
      LT_LOG('Hydrating from cloud…');

      // Profile → push student name + class into homework state
      var profile = await LTCloud.loadProfile();
      window._LT_LAST_PROFILE = profile || window._LT_LAST_PROFILE || null;
      if (profile){
        try {
          if (profile.name)        window.studentName   = profile.name;
          if (profile.section)     window.chosenSection = profile.section;
          if (profile.classLevel)  window.chosenClass   = profile.classLevel;
          if (profile.stream)      window.chosenStream  = profile.stream;
        } catch(e){}
      }

      // Progress
      var prog = await LTCloud.loadProgress();
      if (prog && window._sessionProgress){
        // Merge cloud → local, prefer cloud values for cumulative counters
        Object.assign(window._sessionProgress, prog);
        try { localStorage.setItem('lt_progress_v2', JSON.stringify(window._sessionProgress)); } catch(e){}
        try { window.xp = window._sessionProgress.xp || 0; } catch(e){}
        try { window.streakDays = window._sessionProgress.streak || 0; } catch(e){}
        try { if (typeof window._renderProgressBadges === 'function') window._renderProgressBadges(); } catch(e){}
      }

      // Parent state
      if (profile && profile.role === 'parent'){
        var ph = await LTCloud.loadParentState();
        if (ph && window.LT_PH_STATE){
          window.LT_PH_STATE = Object.assign(window.LT_PH_STATE, ph);
          try { localStorage.setItem('lt_ph_state', JSON.stringify(window.LT_PH_STATE)); } catch(e){}
        }
      }

      // Arena profile
      var arena = await LTCloud.loadArenaProfile();
      if (arena){ try { localStorage.setItem('arena.profile', JSON.stringify(arena)); } catch(e){} }
      else if (profile && window.ArenaDB){
        // Build a default arena profile from the user profile.
        var grp = classGroupFor(profile.section, profile.classLevel);
        var p = {
          uid: LTAuth.uid(),
          name: profile.name || 'Player',
          avatar: profile.avatar || '🦁',
          classGroup: grp,
          state: profile.state || '',
          school: profile.school || '',
          xp: 0, wins: 0, losses: 0,
          createdAt: Date.now()
        };
        try { localStorage.setItem('arena.profile', JSON.stringify(p)); } catch(e){}
        await LTCloud.saveArenaProfile(p);
      }

      // Social profile
      var soc = await LTCloud.loadSocialProfile();
      if (soc){
        try {
          var profs = JSON.parse(localStorage.getItem('lt_social_profiles_v1') || '{}');
          profs[soc.id] = soc;
          localStorage.setItem('lt_social_profiles_v1', JSON.stringify(profs));
          localStorage.setItem('lt_social_me_v1', JSON.stringify(soc));
        } catch(e){}
      }

      // Notify the UI so it can re-render any auth-aware bits.
      try { window.dispatchEvent(new CustomEvent('lt-cloud-hydrated', { detail:{ uid: LTAuth.uid() } })); } catch(e){}
    }
    LTCloud.hydrate = cloudHydrate;

    // ───────────────────────────────────────────────────────────
    // 5. WIRE EXISTING DATA LAYERS TO CLOUD WRITES
    // ───────────────────────────────────────────────────────────
    // We patch the existing writers so that, when signed in, every local
    // write also queues a cloud sync. Local-first: cloud writes never
    // block the UI.
    var pending = {};
    function debouncedSync(key, fn, ms){
      clearTimeout(pending[key]);
      pending[key] = setTimeout(function(){
        Promise.resolve(fn()).catch(function(e){ LT_LOG('sync '+key, e); });
      }, ms || 600);
    }

    // — _sessionProgress (saveProgress lives on window inside homework-1.js)
    (function patchProgress(){
      var orig = window.saveProgress;
      window.saveProgress = function(){
        try { if (orig) orig.apply(this, arguments); } catch(e){}
        if (LTAuth.isSignedIn() && window._sessionProgress){
          debouncedSync('progress', function(){
            // Strip transient session fields before uploading
            var copy = Object.assign({}, window._sessionProgress);
            delete copy._sessionStart;
            delete copy._sessionTopics;
            return LTCloud.saveProgress(copy);
          });
        }
      };
    })();

    // — Parent hub state
    (function patchParent(){
      var orig = window.phSave;
      window.phSave = function(){
        try { if (orig) orig.apply(this, arguments); } catch(e){}
        if (LTAuth.isSignedIn() && window.LT_PH_STATE){
          debouncedSync('parent', function(){ return LTCloud.saveParentState(window.LT_PH_STATE); });
        }
      };
    })();

    // — Arena profile + match recording
    (function patchArena(){
      if (!window.ArenaDB) return;
      var origSave = window.ArenaDB.saveProfile;
      window.ArenaDB.saveProfile = function(p){
        if (origSave) origSave.call(this, p);
        if (LTAuth.isSignedIn()){
          // Stamp uid to make profile authoritative
          p = Object.assign({}, p, { uid: LTAuth.uid() });
          debouncedSync('arenaProfile', function(){ return LTCloud.saveArenaProfile(p); });
        }
      };
      var origRecord = window.ArenaDB.recordMatch;
      window.ArenaDB.recordMatch = function(match){
        if (origRecord) origRecord.call(this, match);
        if (LTAuth.isSignedIn()){
          // Stamp uid on local player in match for cloud aggregate
          var me = LTAuth.uid();
          var stamped = Object.assign({}, match);
          stamped.players = (match.players||[]).map(function(p){
            if (p.isMe) return Object.assign({}, p, { uid: me });
            return p;
          });
          if (match.winnerUid && match.winnerUid === (window.ArenaDB.loadProfile()||{}).uid){
            stamped.winnerUid = me;
          }
          debouncedSync('arenaMatch', function(){ return LTCloud.publishMatch(stamped); }, 100);
        }
      };
      // Add cloud-leaders fetcher
      window.ArenaDB.cloudLeaders = function(classGroup, scope, lim){
        if (!LTAuth.isSignedIn()) return Promise.resolve(null);
        return LTCloud.topLeaders(classGroup, scope, lim);
      };
    })();

    // — Social profile
    (function patchSocial(){
      if (!window.SocialDB) return;
      var origSaveMe = window.SocialDB.saveMe;
      window.SocialDB.saveMe = function(patch){
        var me = origSaveMe.call(this, patch);
        if (LTAuth.isSignedIn()){
          // Use real uid instead of the random local one
          me = Object.assign({}, me, { id: LTAuth.uid() });
          debouncedSync('socialProfile', function(){ return LTCloud.saveSocialProfile(me); });
        }
        return me;
      };
    })();

    LT_LOG('Firebase ready, projectId =', window.LT_FIREBASE_CONFIG.projectId);
    try {
      window.dispatchEvent(new CustomEvent('lt-firebase-ready', { detail:{ enabled:true } }));
    } catch(e){}

  } catch(err){
    console.error('[LT-FB] init failed:', err);
    LTAuth.ready = false;
    LTCloud.ready = false;
    try {
      window.dispatchEvent(new CustomEvent('lt-firebase-ready', { detail:{ enabled:false, error: String(err) } }));
    } catch(e){}
  }
})();

LTAuth._ready = ready;

})();
