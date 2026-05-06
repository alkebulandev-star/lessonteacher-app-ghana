/* ════════════════════════════════════════════════════════════════
   LESSON TEACHER — FULL-SITE MULTILINGUAL ENGINE (v2)
   ────────────────────────────────────────────────────────────────
   Goals:
   1. Auto-translate every visible English string in the DOM to
      Twi / Ewe / Ga, no manual data-lt-tr tagging required.
   2. Persist the user's language across sessions (localStorage +
      Firestore profile when signed in).
   3. Inject "respond in language X" into every AI call so on-the-fly
      lesson generation comes back already translated.
   4. Route ElevenLabs TTS to the right language code so narration
      sounds correct in Twi / Ewe / Ga.
   5. Be honest about the limits — show a friendly first-visit picker,
      a translating-progress UI on first switch, and graceful errors
      when AI is slow or unavailable.

   Public API:
     LTLang.set(code, opts?)       — switch (opts.silent skips UI)
     LTLang.get()                  — current code (en|yo|ig|ha)
     LTLang.t(text)                — sync; returns cached/dict/orig
     LTLang.tAsync(text)           — async; returns translated
     LTLang.applyToDocument()      — translate every visible string
     LTLang.openPicker()           — open the language menu
     LTLang.promptInstruction()    — for AI prompt injection
     LTLang.elevenLanguageCode()   — for TTS API
     LTLang.LANGS                  — list of supported langs
   ════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

// ─── Supported languages ────────────────────────────────────────
var LANGS = {
  en: { name:'English', flag:'🇬🇧', native:'English',  elevenCode:'en' },
  yo: { name:'Twi',     flag:'🇬🇭', native:'Twi',      elevenCode:'en' },
  ig: { name:'Ewe',     flag:'🇬🇭', native:'Eʋegbe',   elevenCode:'en' },
  ha: { name:'Ga',      flag:'🇬🇭', native:'Gã',       elevenCode:'en' }
};

var STORAGE_KEY     = 'lt_lang';
var CACHE_KEY       = 'lt_lang_cache_v2';
var SEEN_PICKER_KEY = 'lt_lang_seen_picker';

// ─── State ──────────────────────────────────────────────────────
var currentLang = 'en';
var cache = {};            // { 'yo|hello': 'pẹ̀lẹ́ o', ... }
var inFlight = {};         // key -> Promise (de-dupe in-flight)
var queue = [];            // pending strings to batch-translate
var queueTimer = null;
var observer = null;
var BATCH_SIZE = 80;       // bigger batches → fewer round-trips
var BATCH_DELAY = 50;      // ms before flushing first queue
var MAX_CONCURRENT = 4;    // run up to 4 batches in parallel

// Progress tracking for the switch UI
var progressBar = null;
var progressActive = false;
var progressTotal = 0;
var progressDone = 0;

// Strings that should NEVER be translated. Case-sensitive match.
var NO_TRANSLATE = new Set([
  'WAEC','WASSCE','BECE','NSMQ','','SAT','TOEFL','IELTS',
  'NaCCA','GES','GETFund','UNESCO','UNICEF','WHO',
  'KNUST','UG Legon','UCC','UMaT','GIMPA','Achimota','Mfantsipim','Wesley Girls\'','Prempeh',
  'JHS 1','JHS 2','JHS 3','SHS 1','SHS 2','SHS 3','SHS','P1','P2','P3','P4','P5','P6',
  'GHS','GH₵','USD','EUR','GBP','$',
  'AI','URL','PDF','HTML','CSS','JS','API','XP','MCQ','CBT',
  'O₂','H₂O','CO₂','NaCl','HCl','H₂SO₄','NaOH','CH₄','C₂H₅OH','H₂','N₂',
  'AM','PM','OK','OK!',
  'Lesson Teacher','Live Arena','Parent Hub','Kids Zone',
  'WhatsApp','Google','Apple','Firebase','Vercel','OpenAI','Anthropic',
  'Twi','Ewe','Ga','English','Pidgin'
]);

// Decide if a string is worth a translation round-trip.
function shouldTranslate(s){
  if (!s) return false;
  s = s.trim();
  if (!s) return false;
  if (s.length < 2) return false;
  if (NO_TRANSLATE.has(s)) return false;
  if (/^[\d\s.,:%GH₵$+/\-=*–—()<>]+$/.test(s)) return false;
  if (!/[a-zA-Z]/.test(s)) return false;
  if (s.length <= 6 && s === s.toUpperCase() && /^[A-Z0-9.\-/]+$/.test(s)) return false;
  // Looks like a hash, key, id, file path
  if (/^[a-z0-9]{16,}$/i.test(s)) return false;
  if (/[a-z]+\.(js|css|html|png|jpg|svg|json)$/i.test(s)) return false;
  if (/^[\w-]+\/[\w/-]+$/.test(s)) return false; // paths
  return true;
}

// ─── Storage ────────────────────────────────────────────────────
function loadCache(){
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); }
  catch(e){ return {}; }
}
function saveCache(){
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); }
  catch(e){ /* quota — silently drop */ }
}
var saveCacheDebounced = (function(){
  var t = null;
  return function(){
    clearTimeout(t);
    t = setTimeout(saveCache, 800);
  };
})();

function loadStoredLang(){
  try {
    var qs = new URLSearchParams(location.search).get('lang');
    if (qs && LANGS[qs]) return qs;
    var s = localStorage.getItem(STORAGE_KEY);
    if (s && LANGS[s]) return s;
  } catch(e){}
  return null;
}
function saveStoredLang(l){
  try { localStorage.setItem(STORAGE_KEY, l); } catch(e){}
  if (window.LTCloud && window.LTCloud.ready && window.LTAuth && window.LTAuth.isSignedIn()){
    try { window.LTCloud.saveProfile({ language: l }); } catch(e){}
  }
}

// ─── Seed dictionary (instant, no AI) ───────────────────────────
// Hand-curated for accuracy on the most-visible strings.
var SEED = {
  'Sign in':            { yo:'Wọlé',          ig:'Banye',          ha:'Shiga' },
  'Sign up':            { yo:'Forukọsílẹ̀',     ig:'Debanye aha',    ha:'Yi rajista' },
  'Sign out':           { yo:'Jáde',           ig:'Pụọ',            ha:'Fita' },
  'Welcome':            { yo:'Káàbọ̀',          ig:'Nnọọ',           ha:'Maraba' },
  'Welcome back':       { yo:'Káàbọ̀',          ig:'Nnọọ ọzọ',       ha:'Maraba da dawowa' },
  'Hello':              { yo:'Pẹ̀lẹ́ o',        ig:'Ndewo',          ha:'Sannu' },
  'Email':              { yo:'Imeèlì',         ig:'Ozi-e',          ha:'Imel' },
  'Password':           { yo:'Ọ̀rọ̀ ìṣípayá',   ig:'Okwuntughe',     ha:'Kalmar wucewa' },
  'Continue':           { yo:'Tẹ̀síwájú',       ig:"Gaa n'ihu",      ha:'Ci gaba' },
  'Cancel':             { yo:'Fagilé',         ig:'Kagbuo',         ha:'Soke' },
  'Save':               { yo:'Fipamọ́',         ig:'Chekwaa',        ha:'Ajiye' },
  'Done':               { yo:'Ó parí',         ig:'Emechara',       ha:'An gama' },
  'Next':               { yo:'Tẹ̀síwájú',       ig:'Osote',          ha:'Na gaba' },
  'Back':               { yo:'Padà',           ig:'Laghachi',       ha:'Koma' },
  'Yes':                { yo:'Bẹ́ẹ̀ni',          ig:'Ee',             ha:'Eh' },
  'No':                 { yo:'Bẹ́ẹ̀kọ́',          ig:'Mba',            ha:"A'a" },
  'Close':              { yo:'Tì',             ig:'Mechie',         ha:'Rufe' },
  'Open':               { yo:'Ṣí',             ig:'Mepee',          ha:'Buɗe' },
  'Loading…':           { yo:'Ń ṣí…',          ig:'Na-ebudata…',    ha:'Ana lodawa…' },
  'Submit':             { yo:'Fi ránṣẹ́',       ig:'Nyefee',         ha:'Mika' },
  'Start':              { yo:'Bẹ̀rẹ̀',           ig:'Bido',           ha:'Fara' },
  'Finish':             { yo:'Parí',           ig:'Mechie',         ha:'Gama' },
  'Settings':           { yo:'Àtúnṣe',         ig:'Ntọala',         ha:'Saituna' },
  'Help':               { yo:'Ìrànlọ́wọ́',       ig:'Enyemaka',       ha:'Taimako' },
  'Send':               { yo:'Fi ránṣẹ́',       ig:'Zipu',           ha:'Aika' },
  'Search':             { yo:'Wá',             ig:'Chọọ',           ha:'Nema' },
  'Student':            { yo:'Akẹ́kọ̀ọ́',         ig:'Nwata akwụkwọ', ha:'Ɗalibi' },
  'Parent':             { yo:'Òbí',            ig:'Nne na nna',     ha:'Iyaye' },
  'Lesson':             { yo:'Ẹ̀kọ́',            ig:'Ihe ọmụmụ',      ha:'Darasi' },
  'Lessons':            { yo:'Àwọn ẹ̀kọ́',       ig:'Ihe ọmụmụ',      ha:'Darussa' },
  'Subject':            { yo:'Ẹ̀kọ́-orí',        ig:'Isiokwu',        ha:'Magana' },
  'Subjects':           { yo:'Àwọn ẹ̀kọ́-orí',   ig:'Isiokwu niile',  ha:'Maganganu' },
  'Topic':              { yo:'Kókó-ọ̀rọ̀',       ig:'Isiokwu',        ha:'Babi' },
  'Quiz':               { yo:'Ìbéèrè',         ig:'Ajụjụ',          ha:'Tambaya' },
  'Exam':               { yo:'Ìdánwò',         ig:'Ule',            ha:'Jarrabawa' },
  'Score':              { yo:'Iye àmì',        ig:'Akara',          ha:'Maki' },
  'Class':              { yo:'Kíláàsì',        ig:'Klaasị',         ha:'Aji' },
  'Level':              { yo:'Ipele',          ig:'Ọkwa',           ha:'Mataki' },
  'Mathematics':        { yo:'Ìṣirò',          ig:'Mgbakọ',         ha:'Lissafi' },
  'English Language':   { yo:'Èdè Gẹ̀ẹ́sì',     ig:'Asụsụ Bekee',   ha:'Harshen Turanci' },
  'Biology':            { yo:'Ẹ̀kọ́ Ẹ̀dá',       ig:'Bayolọji',       ha:'Ilmin halittu' },
  'Chemistry':          { yo:'Kẹ́míkà',         ig:'Kemistrị',       ha:'Ilmin sinadarai' },
  'Physics':            { yo:'Físíìsì',        ig:'Fizik',          ha:'Ilmin lissafi' },
  'Geography':          { yo:'Ìjìnlẹ̀ Ayé',     ig:'Mịkpọrọmkpọ',    ha:'Ilmin ƙasa' },
  'History':            { yo:'Ìtàn',           ig:'Akụkọ',          ha:'Tarihi' },
  'Social Studies':    { yo:'Ẹ̀kọ́ Ìjọba-ìlú',  ig:'Ọzụzụ Obodo',    ha:"Ilimin zama-jama'a" },
  'Live Arena':         { yo:'Pápá Ìpè',       ig:'Ogige Ndụ',      ha:'Filin Wasa' },
  'Watch live':         { yo:'Wo gbangba',     ig:'Lee na ndụ',     ha:'Kallon kai tsaye' },
  'Join':               { yo:'Darapọ̀',         ig:'Sonye',          ha:'Shiga' },
  'Leave':              { yo:'Kúrò',           ig:'Hapụ',           ha:'Fita' },
  'Type a message…':    { yo:'Tẹ ìfiránṣẹ́…',  ig:'Pịnye ozi…',     ha:'Rubuta saƙo…' },
  'My progress':        { yo:'Ìtẹ̀síwájú mi',   ig:'Ọganihu m',      ha:'Ci gaba na' },
  'Profile':            { yo:'Profáìlì',       ig:'Profaịlụ',       ha:'Bayanin sirri' },
  'Logout':             { yo:'Jáde',           ig:'Pụọ',            ha:'Fita' },

  // Landing page CTAs
  'Get Started':        { yo:'Bẹ̀rẹ̀ Báyìí',     ig:"Bido Ugbu a",   ha:'Fara Yanzu' },
  'Enter Classroom':    { yo:'Wọ̀ Kíláàsì',     ig:'Banye Klaasị',   ha:'Shiga Aji' },
  'Try it free':        { yo:'Gbìyànjú lọ́fẹ̀ẹ́', ig:'Gbalịa n\'efu', ha:'Gwada kyauta' },
  'Learn more':         { yo:'Kọ́ síwájú',      ig:'Mụta ihe ọzọ',   ha:'Ƙara koyo' },
  'Choose your level':  { yo:'Yan ipele rẹ',   ig:'Họrọ ọkwa gị',   ha:'Zaɓi matakinka' },
  'Pick your class':    { yo:'Yan kíláàsì rẹ', ig:'Họrọ klaasị gị', ha:'Zaɓi ajinka' },

  // Sections
  'Kids Zone':          { yo:'Agbègbè Ọmọdé',   ig:'Mpaghara Ụmụaka',ha:'Yankin Yara' },
  'Primary':            { yo:'Alábọ́dé',        ig:'Praịmarị',       ha:'Firamare' },
  'Junior Secondary':   { yo:'Ilé-Ẹ̀kọ́ Kékeré', ig:'Sekọnde nta',    ha:'Sakandare ƙarami' },
  'Senior Secondary':   { yo:'Ilé-Ẹ̀kọ́ Àgbà',   ig:'Sekọnde ukwu',   ha:'Sakandare babba' },

  // Common verbs
  'Try Again':          { yo:'Gbìyànjú lẹ́ẹ̀kan',ig:'Nwaa ọzọ',       ha:'Sake gwadawa' },
  'Read':               { yo:'Kà',             ig:'Gụọ',            ha:'Karanta' },
  'Listen':             { yo:'Gbọ́',            ig:'Gee ntị',        ha:'Saurara' },
  'Watch':              { yo:'Wo',             ig:'Lee',            ha:'Kalla' },
  'Practice':           { yo:'Ṣe Ìdánrawò',    ig:'Mee mmega',      ha:'Yi Aiki' },
  'Review':             { yo:'Ṣàyẹ̀wò',         ig:'Lelee',          ha:'Bita' },
  'Try':                { yo:'Gbìyànjú',       ig:'Nwaa',           ha:'Gwada' },
  'Edit':               { yo:'Ṣàtúnṣe',        ig:'Dezie',          ha:'Gyara' },
  'Delete':             { yo:'Pa rẹ́',          ig:'Hichapụ',        ha:'Share' },
  'Add':                { yo:'Fi kún',         ig:'Tinye',          ha:'Ƙara' },
  'Remove':             { yo:'Yọ kúrò',        ig:'Wepụ',           ha:'Cire' },
  'Confirm':            { yo:'Jẹ́rìí síi',     ig:'Kwado',          ha:'Tabbatar' },
  'OK':                 { yo:'Ó dáa',         ig:'Ọ dị mma',       ha:'Lafiya' },

  // Classroom essentials
  'Tap a subject below to begin': {
    yo:'Tẹ ẹ̀kọ́-orí kan ní ìsàlẹ̀ láti bẹ̀rẹ̀',
    ig:'Pịa otu isiokwu n\'okpuru iji bido',
    ha:'Danna magana ɗaya a ƙasa don farawa'
  },
  'Subjects':           { yo:'Àwọn Ẹ̀kọ́-orí',   ig:'Isiokwu niile',  ha:'Maganganu' },
  'Tap a subject':      { yo:'Tẹ ẹ̀kọ́-orí kan', ig:'Pịa isiokwu',    ha:'Danna magana' },
  'Term':               { yo:'Ìgbà-ẹ̀kọ́',       ig:'Tam',            ha:'Lokaci' },
  'Week':               { yo:'Ọ̀sẹ̀',            ig:'Izu',            ha:'Mako' },
  'Day':                { yo:'Ọjọ́',            ig:'Ụbọchị',         ha:'Rana' },

  // Subject names common
  'Agricultural Science':{ yo:'Sáyẹ́nsì Iṣẹ́ Àgbẹ̀', ig:'Sayensị Ọrụ Ugbo', ha:'Kimiyyar Noma' },
  'Government':         { yo:'Ìjọba',          ig:'Ọchịchị',        ha:'Gwamnati' },
  'Economics':          { yo:'Ìmọ̀-ọrọ̀-ajé',     ig:'Akụnụba',        ha:'Tattalin Arziki' },
  'Literature':         { yo:'Ìwé Ìmọ̀-ọ̀rọ̀',     ig:'Akwụkwọ Edemede', ha:'Adabi' },
  'Computer':           { yo:'Kọ̀mpútà',         ig:'Kọmputa',        ha:'Kwamfuta' },
  'Computing (ICT)':   { yo:'Ẹ̀kọ́ Kọ̀mpútà',     ig:'Ọmụmụ Kọmputa',  ha:'Karatun Kwamfuta' },
  'Civic':              { yo:'Ìjọba-ìlú',       ig:'Obodo',          ha:"Zama-jama'a" },
  'Music':              { yo:'Orin',            ig:'Egwu',           ha:'Kiɗa' },
  'Fine Arts':          { yo:'Iṣẹ́-Ọnà',         ig:'Nka',            ha:'Zane-zane' },

  // Status / states
  'Online':             { yo:'Lórí ìkànnì',     ig:'N\'ịntanetị',    ha:'A kan layi' },
  'Offline':            { yo:'Kò sí lórí ìkànnì', ig:'Anaghị n\'ịntanetị', ha:'A waje' },
  'Active':             { yo:'Ń ṣiṣẹ́',           ig:'Na-arụ',        ha:'Mai aiki' },
  'Inactive':           { yo:'Kò ń ṣiṣẹ́',        ig:'Anaghị arụ',    ha:'Ba ya aiki' },
  'New':                { yo:'Tuntun',           ig:'Ọhụụ',          ha:'Sabuwa' },
  'Live':               { yo:'Láàyè',            ig:'Ndụ',           ha:'Kai tsaye' },
  'Coming soon':        { yo:'Yóò dé láìpẹ́',     ig:'Na-abịa n\'oge', ha:'Zai zo nan ba da daɗewa' },

  // Common UI fragments
  'today':              { yo:'lónìí',            ig:'taa',           ha:'yau' },
  'yesterday':          { yo:'àná',              ig:'ụnyaahụ',       ha:'jiya' },
  'tomorrow':           { yo:'ọ̀la',              ig:'echi',          ha:'gobe' },
  'now':                { yo:'báyìí',            ig:'ugbu a',        ha:'yanzu' },
  'minutes':            { yo:'ìṣẹ́jú',            ig:'nkeji',         ha:'mintuna' },
  'hour':               { yo:'wákàtí',            ig:'awa',           ha:'awa' },
  'hours':              { yo:'wákàtí',            ig:'awa',           ha:'sa\'o\'i' },
  'second':             { yo:'ìṣẹ́jú-ààyà',       ig:'sekọnd',        ha:'daƙiƙa' },
  'seconds':            { yo:'ìṣẹ́jú-ààyà',       ig:'sekọnd',        ha:'daƙiƙu' },

  // Common questions / prompts
  'Ask the AI':         { yo:'Béèrè AI',         ig:'Jụọ AI',        ha:'Tambayi AI' },
  'Ask a question':     { yo:'Béèrè ìbéèrè',     ig:'Jụọ ajụjụ',     ha:"Yi tambaya" },
  'Type your question…':{ yo:'Tẹ ìbéèrè rẹ…',   ig:'Pịnye ajụjụ gị…', ha:'Rubuta tambayar ka…' },
  'Generate':           { yo:'Gbé jáde',         ig:'Mepụta',        ha:'Samar' },
  'Generating…':        { yo:'Ń gbé jáde…',      ig:'Na-emepụta…',   ha:'Ana samarwa…' },
  'Please wait…':       { yo:'Jọ̀wọ́ dúró…',       ig:'Biko chere…',   ha:'Don Allah jira…' },
  'Reload':             { yo:'Tún kò sílẹ̀',     ig:'Bugharịa',      ha:'Sake lodawa' },
  'Refresh':            { yo:'Tún ṣe',          ig:'Megharịa',      ha:'Sabuntawa' },
  'Skip':               { yo:'Yọkúrò',          ig:'Mafere',        ha:'Tsallake' },
  'Show more':          { yo:'Fi hàn púpọ̀ síi',  ig:'Gosi ihe ọzọ',  ha:'Nuna ƙari' },
  'Show less':          { yo:'Fi hàn dé̩dí̩',     ig:'Gosi obere',    ha:'Nuna kaɗan' },
  'View':               { yo:'Wò',              ig:'Lelee',         ha:'Duba' },
  'Read more':          { yo:'Kà síwájú',       ig:'Gụkwuo ọzọ',    ha:'Karanta ƙari' },

  // Quiz / exam micro-copy
  'Question':           { yo:'Ìbéèrè',          ig:'Ajụjụ',         ha:'Tambaya' },
  'Questions':          { yo:'Àwọn ìbéèrè',     ig:'Ajụjụ niile',   ha:'Tambayoyi' },
  'Answer':             { yo:'Ìdáhùn',          ig:'Azịza',         ha:'Amsa' },
  'Correct':            { yo:'Ó tọ̀nà',          ig:'Ezi',           ha:'Daidai' },
  'Incorrect':          { yo:'Kò tọ̀nà',         ig:'Adịghị mma',    ha:'Ba daidai ba' },
  'Try this':           { yo:'Gbìyànjú èyí',    ig:'Nwaa nke a',    ha:'Gwada wannan' },
  'Continue to next':   { yo:'Tẹ̀síwájú',        ig:"Gaa n'ihu",     ha:'Ci gaba zuwa na gaba' },
  'Show answer':        { yo:'Fi ìdáhùn hàn',   ig:'Gosi azịza',    ha:'Nuna amsa' },
  'Hide answer':        { yo:'Fi ìdáhùn pamọ́',  ig:'Zoo azịza',     ha:'Boye amsa' },

  // Parent hub
  'Parent Hub':         { yo:'Ìpàdé Òbí',       ig:'Ebe Nne na nna', ha:'Cibiyar Iyaye' },
  'Dashboard':          { yo:'Pátákó',          ig:'Daashboodu',    ha:'Allon ɓuga' },
  'Progress':           { yo:'Ìtẹ̀síwájú',       ig:'Ọganihu',       ha:'Ci gaba' },
  'This week':          { yo:'Ọ̀sẹ̀ yìí',          ig:'Izu a',         ha:'Mako mai zuwa' },
  'This month':         { yo:'Oṣù yìí',          ig:'Ọnwa a',        ha:'Watan nan' },
  'Schedule':           { yo:'Ètò',              ig:'Eserese oge',   ha:'Lokaci' },

  // App-specific
  'AI Tutor':           { yo:'Olùkọ́ AI',        ig:'Onye nkụzi AI', ha:'Malamin AI' },
  'XP earned':          { yo:'XP tí o jèrè',    ig:'XP enwetara',   ha:'XP da aka samu' },
  'Day streak':         { yo:'Ọjọ́ tó tẹ̀ síwájú',ig:'Ụbọchị nta',    ha:'Kwanaki a jere' },
  'Topics done':        { yo:'Kókó-ọ̀rọ̀ tó parí', ig:'Isiokwu emechara', ha:'Babi da aka gama' },
  'Mock exams':         { yo:'Ìdánwò àpẹẹrẹ',   ig:'Ule mmega',     ha:'Jarrabawar gwaji' },

  // Onboarding flow strings
  'Just tell me who you are':{
    yo:'Sọ fún mi ẹni tí o jẹ́',
    ig:'Naanị gwa m onye ị bụ',
    ha:'Kawai gaya min wanene kai'
  },
  'What is your name?': {
    yo:'Kí ni orúkọ rẹ?',
    ig:'Kedu aha gị?',
    ha:'Mene ne sunanka?'
  },
  'Your name':          { yo:'Orúkọ rẹ',        ig:'Aha gị',        ha:'Sunanka' },
  'Good day!':          { yo:'Ẹ kú ọjọ́!',       ig:'Ụbọchị ọma!',   ha:'Ina kwana!' },
  'I am Lesson Teacher':{ yo:'Èmi ni Olùkọ́ Ẹ̀kọ́', ig:'A bụ m Onye nkụzi', ha:'Ni ne Malamin Darasi' }
};

// Pre-load seed into cache so the first switch isn't a cold start.
function primeSeed(){
  Object.keys(SEED).forEach(function(en){
    var t = SEED[en];
    if (!t) return;
    Object.keys(t).forEach(function(lang){
      var key = lang + '|' + en;
      if (!cache[key]) cache[key] = t[lang];
    });
  });
}

// ─── Translation lookup ─────────────────────────────────────────
function cacheGet(text, lang){
  if (lang === 'en') return text;
  return cache[lang + '|' + text];
}
function cacheSet(text, lang, val){
  cache[lang + '|' + text] = val;
  saveCacheDebounced();
}

// Synchronous t() — returns cache or original. Triggers async fill if missing.
function tSync(text){
  if (!text || currentLang === 'en') return text;
  var c = cacheGet(text, currentLang);
  if (c) return c;
  // Schedule background translation
  enqueue(text);
  return text;  // for now, return original
}

async function tAsync(text){
  if (!text || currentLang === 'en') return text;
  var c = cacheGet(text, currentLang);
  if (c) return c;
  var key = currentLang + '|' + text;
  if (inFlight[key]) return inFlight[key];
  inFlight[key] = (async function(){
    try {
      var arr = await translateBatch([text], currentLang);
      var out = arr && arr[0] ? arr[0] : text;
      cacheSet(text, currentLang, out);
      return out;
    } finally {
      delete inFlight[key];
    }
  })();
  return inFlight[key];
}

var inFlightBatches = 0;

function enqueue(text){
  if (currentLang === 'en') return;
  if (!shouldTranslate(text)) return;
  var key = currentLang + '|' + text;
  if (cache[key] || inFlight[key]) return;
  if (queue.indexOf(text) !== -1) return;
  queue.push(text);
  if (queueTimer) return;
  queueTimer = setTimeout(flushQueue, BATCH_DELAY);
}

function flushQueue(){
  queueTimer = null;
  // Spawn up to MAX_CONCURRENT batches running in parallel.
  // Each one drains BATCH_SIZE strings; any remaining trigger the next round.
  while (queue.length && inFlightBatches < MAX_CONCURRENT){
    runOneBatch();
  }
}

async function runOneBatch(){
  if (!queue.length) return;
  var batch = queue.splice(0, BATCH_SIZE);
  var lang = currentLang;
  if (lang === 'en') return;

  inFlightBatches++;
  batch.forEach(function(t){ inFlight[lang + '|' + t] = true; });

  try {
    var translated = await translateBatch(batch, lang);
    if (translated && translated.length){
      for (var i = 0; i < batch.length; i++){
        var en = batch[i];
        var tr = translated[i] || en;
        cacheSet(en, lang, tr);
      }
    }
    // Re-apply visible translations as soon as a batch returns.
    applyToDocument({ skipQueue: true });
  } catch(e){
    console.warn('[LTLang] batch failed', e);
  } finally {
    batch.forEach(function(t){ delete inFlight[lang + '|' + t]; });
    progressDone += batch.length;
    updateProgressBar();
    inFlightBatches--;
    // If more remain in the queue, kick another batch off immediately
    if (queue.length){
      runOneBatch();
    } else if (inFlightBatches === 0){
      hideProgressBar();
    }
  }
}

// ─── Batch translation via /api/openai ──────────────────────────
async function translateBatch(strings, lang){
  if (!strings.length) return [];
  if (lang === 'en') return strings.slice();
  var langName = LANGS[lang].name;

  // Use a numbered-list format which the model is most reliable at
  // returning verbatim. We accept "1) ..." or "1. ..." or "1: ...".
  var numbered = strings.map(function(s, i){
    // Use a separator the model is unlikely to emit naturally
    return (i + 1) + '. ' + s.replace(/\n/g, ' ');
  }).join('\n');

  var system =
    'Translate each numbered phrase to ' + langName + '. Natural, modern, Ghanaian-student tone. ' +
    'Keep proper names (WAEC, WASSCE), formulas, numbers in original form. ' +
    'Output the SAME numbered list — translation only, one per line, no quotes, no preamble.';

  try {
    var resp = await fetch('/api/openai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: Math.min(4000, 80 * strings.length),
        system: system,
        messages: [{ role: 'user', content: numbered }]
      })
    });
    if (!resp.ok) throw new Error('translate http ' + resp.status);
    var data = await resp.json();
    var raw = '';
    if (data && data.content && data.content[0] && data.content[0].text) raw = data.content[0].text;
    else if (typeof data.content === 'string') raw = data.content;
    else if (data && data.choices && data.choices[0] && data.choices[0].message) raw = data.choices[0].message.content;
    if (!raw) throw new Error('empty translation');
    return parseNumberedList(raw, strings.length);
  } catch(e){
    console.warn('[LTLang] translateBatch error', e);
    return strings.slice();  // graceful: return originals
  }
}

function parseNumberedList(text, expected){
  // Accept "1. text", "1) text", "1: text", and tolerant whitespace.
  var lines = text.split(/\r?\n/);
  var out = new Array(expected).fill(null);
  var rx = /^\s*(\d+)[\.\)\:]\s*(.+)$/;
  lines.forEach(function(line){
    var m = line.match(rx);
    if (!m) return;
    var idx = parseInt(m[1], 10) - 1;
    if (idx < 0 || idx >= expected) return;
    out[idx] = m[2].trim();
  });
  return out;
}

// ─── DOM walker ─────────────────────────────────────────────────
// Walks every visible text node + a known set of attributes and
// translates them. Uses original-text caching on the node so we
// can revert / re-translate without losing the source.
var ATTR_TARGETS = ['placeholder', 'title', 'aria-label', 'alt', 'value'];

function isTranslatableElement(el){
  if (!el) return false;
  if (el.nodeType !== 1) return false;
  var tag = el.tagName;
  if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'CODE' || tag === 'PRE') return false;
  if (el.hasAttribute('data-no-translate')) return false;
  if (el.closest && el.closest('[data-no-translate]')) return false;
  // Don't translate the language picker itself (keeps native names visible)
  if (el.id === 'lt-lang-btn' || (el.closest && el.closest('#lt-lang-btn'))) return false;
  if (el.classList && el.classList.contains('lt-lang-menu')) return false;
  // Code editors, math
  if (el.classList && (el.classList.contains('katex') || el.classList.contains('MathJax'))) return false;
  // Skip areas the app rebuilds frequently — translating these causes
  // race conditions with re-renders. The text content here will be
  // translated by the AI itself when it generates content (because we
  // inject "respond in [language]" into AI prompts).
  if (el.closest){
    if (el.closest('#sbSubjects')) return false;       // sidebar subject list
    if (el.closest('#wcSubjGrid')) return false;       // welcome-screen subject grid
    if (el.closest('#lessonBody')) return false;       // AI-generated lesson body
    if (el.closest('#chatBody')) return false;         // AI tutor chat
    if (el.closest('#hwChatMsgs')) return false;       // homework chat
    if (el.closest('#examQuestionArea')) return false; // AI-generated exam questions
    if (el.closest('#essayTopicGrid')) return false;   // AI-generated essay topics
    if (el.closest('.theory-question-col')) return false; // theory question pane
    if (el.closest('.tqc-body')) return false;         // theory body inner
  }
  return true;
}

function nodeIsHiddenInLayout(node){
  // Don't waste API on hidden content
  var el = node.nodeType === 1 ? node : node.parentElement;
  if (!el) return true;
  // We don't getBoundingClientRect on every node (too slow); a CSS check is cheap
  // Skip if any ancestor has display:none or visibility:hidden
  var cur = el;
  while (cur && cur !== document.body){
    var s = cur.style;
    if (s && (s.display === 'none' || s.visibility === 'hidden')) return true;
    cur = cur.parentElement;
  }
  return false;
}

// Walk a root and translate text nodes + attributes.
function applyToTree(root, opts){
  opts = opts || {};
  if (!root) return;
  if (currentLang === 'en'){
    revertTree(root);
    return;
  }

  // 1) Text nodes — collect first, sort visible-first, then queue
  var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: function(node){
      var p = node.parentElement;
      if (!isTranslatableElement(p)) return NodeFilter.FILTER_REJECT;
      var txt = node.nodeValue || '';
      if (!shouldTranslate(txt)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  var visibleQ = [];
  var hiddenQ = [];
  var viewportH = (window.innerHeight || 800);
  var n;
  while ((n = walker.nextNode())){
    var orig = n.__ltOrig != null ? n.__ltOrig : n.nodeValue;
    if (n.__ltOrig == null) n.__ltOrig = orig;
    var trimmed = orig.trim();
    if (!trimmed){ continue; }
    var tr = cacheGet(trimmed, currentLang);
    if (tr){
      var lead = orig.match(/^\s*/)[0];
      var trail = orig.match(/\s*$/)[0];
      n.nodeValue = lead + tr + trail;
    } else if (!opts.skipQueue){
      // Test visibility cheaply: parent rect, top within 2× viewport
      var p = n.parentElement;
      var visible = false;
      if (p && p.getBoundingClientRect){
        var r = p.getBoundingClientRect();
        if (r.bottom > -10 && r.top < viewportH * 2) visible = true;
      }
      if (visible) visibleQ.push(trimmed);
      else hiddenQ.push(trimmed);
    }
  }
  // Queue visible first, then hidden, so on-screen content translates first
  visibleQ.forEach(enqueue);
  hiddenQ.forEach(enqueue);

  // 2) Attribute targets
  if (root.querySelectorAll){
    root.querySelectorAll('[placeholder], [title], [aria-label], [alt]').forEach(function(el){
      if (!isTranslatableElement(el)) return;
      ATTR_TARGETS.forEach(function(attr){
        if (!el.hasAttribute(attr)) return;
        var origAttr = '__ltOrig_' + attr;
        var orig = el[origAttr] != null ? el[origAttr] : el.getAttribute(attr);
        if (el[origAttr] == null) el[origAttr] = orig;
        if (!shouldTranslate(orig)){ return; }
        var tr = cacheGet(orig.trim(), currentLang);
        if (tr) el.setAttribute(attr, tr);
        else if (!opts.skipQueue) enqueue(orig.trim());
      });
    });
  }
}

function revertTree(root){
  if (!root) return;
  if (root.nodeType === 1){
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var n;
    while ((n = walker.nextNode())){
      if (n.__ltOrig != null) n.nodeValue = n.__ltOrig;
    }
    if (root.querySelectorAll){
      root.querySelectorAll('*').forEach(function(el){
        ATTR_TARGETS.forEach(function(attr){
          var origAttr = '__ltOrig_' + attr;
          if (el[origAttr] != null) el.setAttribute(attr, el[origAttr]);
        });
      });
    }
  }
}

function applyToDocument(opts){
  applyToTree(document.body, opts);
}

// ─── MutationObserver — DISABLED in v9 ────────────────────────────
// The observer caused multiple regressions: translating mid-render,
// breaking dynamic content (sidebar, lessons, exam questions).
// We now translate only on:
//   1. Initial page load (boot)
//   2. Explicit language change (LTLang.set)
//   3. Page navigation via goTo (hooked separately)
// AI-generated content gets language from prompt injection.
function startObserver(){
  // No-op. See header comment.
}

// Hook goTo so we re-translate after navigation completes.
function installNavHook(){
  var attempts = 0;
  var iv = setInterval(function(){
    attempts++;
    if (typeof window.goTo === 'function'){
      clearInterval(iv);
      var orig = window.goTo;
      window.goTo = function(){
        var r = orig.apply(this, arguments);
        if (currentLang !== 'en'){
          setTimeout(function(){
            try { applyToDocument(); } catch(e){}
          }, 250);
        }
        return r;
      };
    } else if (attempts > 20){
      clearInterval(iv);
    }
  }, 250);
}

var pendingTrees = [];
var treeTimer = null;
function scheduleTreeApply(node){
  // De-duplicate: if an ancestor is already queued, skip
  for (var i = 0; i < pendingTrees.length; i++){
    if (pendingTrees[i].contains && pendingTrees[i].contains(node)) return;
  }
  pendingTrees.push(node);
  if (treeTimer) return;
  // 400ms throttle — gives the app room to finish a render before
  // we walk the tree.
  treeTimer = setTimeout(function(){
    treeTimer = null;
    var roots = pendingTrees.splice(0);
    roots.forEach(function(r){
      // Only translate if the root is still in the document
      if (document.body.contains(r)) applyToTree(r);
    });
  }, 400);
}

// ─── Progress UI on first switch ───────────────────────────────
function showProgressBar(totalEstimate){
  hideProgressBar();
  progressActive = true;
  progressTotal = totalEstimate;
  progressDone = 0;
  var bar = document.createElement('div');
  bar.id = 'lt-lang-progress';
  bar.style.cssText = [
    'position:fixed','top:0','left:0','right:0',
    'z-index:2147483646',
    'background:linear-gradient(90deg,#10b981,#3b82f6)',
    'color:#fff',
    'font-family:"Plus Jakarta Sans",system-ui,sans-serif',
    'font-size:.82rem','font-weight:700',
    'padding:8px 16px',
    'box-shadow:0 2px 12px rgba(0,0,0,.4)',
    'display:flex','align-items:center','justify-content:center','gap:14px',
    'flex-wrap:wrap'
  ].join(';');
  bar.innerHTML =
    '<span id="lt-lp-spinner" style="display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;animation:ltLpSpin 1s linear infinite;"></span>' +
    '<span id="lt-lp-label">Translating into ' + LANGS[currentLang].name + '…</span>' +
    '<span id="lt-lp-count" style="opacity:.85;font-weight:600;font-size:.75rem;"></span>' +
    '<style>@keyframes ltLpSpin{to{transform:rotate(360deg)}}</style>';
  document.body.appendChild(bar);
  progressBar = bar;
  updateProgressBar();
}
function updateProgressBar(){
  if (!progressBar) return;
  var c = document.getElementById('lt-lp-count');
  if (c) c.textContent = progressDone + ' / ' + progressTotal;
}
function hideProgressBar(){
  if (!progressBar) return;
  progressBar.remove();
  progressBar = null;
  progressActive = false;
}

// ─── Public API ─────────────────────────────────────────────────
var LTLang = {
  LANGS: LANGS,
  get: function(){ return currentLang; },
  elevenLanguageCode: function(){
    var L = LANGS[currentLang]; return (L && L.elevenCode) || 'en';
  },
  set: function(lang, opts){
    opts = opts || {};
    if (!LANGS[lang]) return;
    var prev = currentLang;
    currentLang = lang;
    saveStoredLang(lang);

    // Clear stale dynamic content from the previous language. AI-generated
    // content (lessons, chat) is locked to the language at fetch time —
    // when the user switches language, that content is now wrong, so wipe
    // it. Next interaction will fetch fresh content in the new language.
    if (prev !== lang){
      var stalePanels = ['lessonBody', 'chatBody', 'hwChatMsgs', 'examQuestionArea'];
      stalePanels.forEach(function(id){
        var el = document.getElementById(id);
        if (el) {
          // Only clear if it has actual content (don't wipe placeholders)
          if (el.children.length > 0 || (el.textContent || '').trim().length > 80){
            el.__ltOrig = null;
            el.innerHTML = '';
          }
        }
      });
      // Cancel any in-flight lesson/exam request that's still running
      try {
        if (window._abortCurrentLesson) window._abortCurrentLesson();
      } catch(e){}
    }

    if (lang === 'en'){
      revertTree(document.body);
      hideProgressBar();
    } else {
      var pending = 0;
      var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode: function(node){
          var p = node.parentElement;
          if (!isTranslatableElement(p)) return NodeFilter.FILTER_REJECT;
          var txt = (node.nodeValue||'').trim();
          if (!shouldTranslate(txt)) return NodeFilter.FILTER_REJECT;
          if (cacheGet(txt, lang)) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      while (walker.nextNode()) pending++;
      if (pending > 0 && !opts.silent) showProgressBar(pending);
      applyToDocument();
    }
    LTLang._updateButton();
    try { window.dispatchEvent(new CustomEvent('lt-lang-changed', { detail:{ lang: lang, prev: prev } })); } catch(e){}
  },
  t: tSync,
  tAsync: tAsync,
  applyToDocument: applyToDocument,
  promptInstruction: function(){
    if (currentLang === 'en') return '';
    var langName = LANGS[currentLang].name;
    return '\n\nIMPORTANT: The user prefers to read in ' + langName + '. Respond ENTIRELY in ' + langName +
           ' — translate all explanations, examples, questions, and feedback.\n' +
           'Keep proper nouns (WAEC, WASSCE, person names), numbers, chemical formulas, and mathematical notation in their standard form.\n' +
           'Use natural conversational ' + langName + ' a Ghanaian student would speak. If you must use an English technical term that has no widely-used ' + langName + ' equivalent, write the ' + langName + ' explanation first then put the English term in brackets.';
  },
  openPicker: openPicker,
  _updateButton: function(){
    var btn = document.getElementById('lt-lang-btn');
    if (btn){
      btn.querySelector('.lt-lang-flag').textContent = LANGS[currentLang].flag;
      btn.querySelector('.lt-lang-name').textContent = LANGS[currentLang].native;
    }
  }
};
window.LTLang = LTLang;

// ─── Language picker UI ─────────────────────────────────────────
function openPicker(){
  document.querySelectorAll('.lt-lang-menu, .lt-lang-modal').forEach(function(m){ m.remove(); });
  var btn = document.getElementById('lt-lang-btn');
  // If we have a button anchor, render a small dropdown.
  if (btn){
    renderDropdown(btn);
  } else {
    renderModal();
  }
}

function renderDropdown(btn){
  var menu = document.createElement('div');
  menu.className = 'lt-lang-menu';
  menu.setAttribute('data-no-translate','1');
  menu.style.cssText = 'position:fixed;background:#0f1824;border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:6px;min-width:200px;box-shadow:0 12px 40px rgba(0,0,0,.5);z-index:2147483641;font-family:"Plus Jakarta Sans",system-ui,sans-serif;';
  menu.innerHTML = Object.keys(LANGS).map(function(code){
    var L = LANGS[code];
    var on = code === currentLang;
    return '<button data-l="' + code + '" style="display:flex;align-items:center;gap:10px;width:100%;padding:10px 12px;background:' + (on ? 'rgba(59,130,246,.18)' : 'none') + ';border:0;color:#e2e8f0;border-radius:8px;cursor:pointer;font-family:inherit;font-size:.88rem;text-align:left;font-weight:' + (on ? '700' : '500') + ';">' +
      '<span style="font-size:1.15rem;">' + L.flag + '</span>' +
      '<span>' + L.native + '</span>' +
      (on ? '<span style="margin-left:auto;color:#60a5fa;">✓</span>' : '') +
    '</button>';
  }).join('');
  document.body.appendChild(menu);
  var r = btn.getBoundingClientRect();
  menu.style.top = (r.bottom + 8) + 'px';
  menu.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
  menu.querySelectorAll('button').forEach(function(b){
    b.onclick = function(){
      LTLang.set(b.getAttribute('data-l'));
      menu.remove();
    };
  });
  setTimeout(function(){
    var close = function(e){
      if (menu.contains(e.target) || (btn && btn.contains(e.target))) return;
      menu.remove();
      document.removeEventListener('click', close, true);
    };
    document.addEventListener('click', close, true);
  }, 10);
}

function renderModal(firstVisit){
  var bd = document.createElement('div');
  bd.className = 'lt-lang-modal';
  bd.setAttribute('data-no-translate','1');
  bd.style.cssText = 'position:fixed;inset:0;background:rgba(8,14,26,.92);backdrop-filter:blur(8px);z-index:2147483640;display:flex;align-items:center;justify-content:center;padding:20px;';
  var card = document.createElement('div');
  card.style.cssText = 'width:100%;max-width:460px;background:#0f1824;color:#f0f4ff;border:1px solid rgba(255,255,255,.1);border-radius:18px;padding:28px 24px;font-family:"Plus Jakarta Sans",system-ui,sans-serif;box-shadow:0 30px 80px rgba(0,0,0,.6);';
  card.innerHTML =
    '<div style="font-size:2.5rem;margin-bottom:8px;text-align:center;">🌍</div>' +
    '<h2 style="font-family:\'Bricolage Grotesque\',sans-serif;font-size:1.5rem;font-weight:800;margin:0 0 6px;color:#fff;text-align:center;">Choose your language</h2>' +
    '<p style="color:rgba(255,255,255,.7);font-size:.92rem;margin:0 0 22px;text-align:center;line-height:1.5;">Lessons, exams, and the AI tutor will speak to you in the language you read best.</p>' +
    '<div style="display:flex;flex-direction:column;gap:8px;">' +
      Object.keys(LANGS).map(function(code){
        var L = LANGS[code];
        var on = code === currentLang;
        return '<button data-l="' + code + '" style="display:flex;align-items:center;gap:14px;width:100%;padding:14px 16px;background:' + (on ? 'rgba(59,130,246,.2)' : 'rgba(255,255,255,.04)') + ';border:1.5px solid ' + (on ? 'rgba(59,130,246,.5)' : 'rgba(255,255,255,.08)') + ';color:#fff;border-radius:11px;cursor:pointer;font-family:inherit;font-size:1rem;text-align:left;font-weight:700;transition:all .15s;">' +
          '<span style="font-size:1.6rem;">' + L.flag + '</span>' +
          '<span style="flex:1;">' + L.native + '</span>' +
          (on ? '<span style="color:#60a5fa;font-size:1.1rem;">✓</span>' : '') +
        '</button>';
      }).join('') +
    '</div>' +
    (firstVisit
      ? '<div style="margin-top:18px;padding:12px 14px;background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.2);border-radius:10px;color:rgba(110,231,183,.9);font-size:.78rem;line-height:1.5;">💡 You can change this any time using the 🌍 button at the top of the page.</div>'
      : '') +
    '<button id="lt-modal-close" style="margin-top:14px;width:100%;padding:11px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#e2e8f0;border-radius:9px;font-family:inherit;font-weight:600;font-size:.88rem;cursor:pointer;">Close</button>';

  bd.appendChild(card);
  document.body.appendChild(bd);

  card.querySelectorAll('button[data-l]').forEach(function(b){
    b.onclick = function(){
      LTLang.set(b.getAttribute('data-l'));
      bd.remove();
      try { localStorage.setItem(SEEN_PICKER_KEY, '1'); } catch(e){}
    };
  });
  card.querySelector('#lt-modal-close').onclick = function(){
    bd.remove();
    try { localStorage.setItem(SEEN_PICKER_KEY, '1'); } catch(e){}
  };
}

// ─── Top-bar globe button ──────────────────────────────────────
function ensureLanguageButton(){
  if (document.getElementById('lt-lang-btn')) return;
  // Try landing nav first; otherwise put it in body fixed top-right
  var navR = document.querySelector('#pg-landing .nav-r');
  var btn = document.createElement('button');
  btn.id = 'lt-lang-btn';
  btn.type = 'button';
  btn.setAttribute('data-no-translate','1');
  btn.style.cssText = navR
    ? 'display:inline-flex;align-items:center;gap:6px;padding:6px 10px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:100px;cursor:pointer;font-family:inherit;color:#fff;font-size:.82rem;font-weight:600;margin-right:6px;'
    : 'position:fixed;top:12px;right:14px;z-index:2147483639;display:inline-flex;align-items:center;gap:6px;padding:7px 12px;background:rgba(15,24,36,.85);border:1px solid rgba(255,255,255,.12);border-radius:100px;cursor:pointer;font-family:"Plus Jakarta Sans",system-ui,sans-serif;color:#fff;font-size:.82rem;font-weight:600;backdrop-filter:blur(6px);box-shadow:0 4px 14px rgba(0,0,0,.3);';
  btn.innerHTML =
    '<span class="lt-lang-flag" style="font-size:1rem;">' + LANGS[currentLang].flag + '</span>' +
    '<span class="lt-lang-name">' + LANGS[currentLang].native + '</span>';
  btn.onclick = function(e){ e.stopPropagation(); LTLang.openPicker(); };

  if (navR){
    var authChip = navR.querySelector('.lt-acct-chip');
    if (authChip) navR.insertBefore(btn, authChip);
    else navR.appendChild(btn);
  } else {
    document.body.appendChild(btn);
  }
}

// ─── AI fetch hook (inject language instruction) ────────────────
function patchAICalls(){
  var origFetch = window.fetch;
  window.fetch = function(url, opts){
    if (currentLang !== 'en' && opts && opts.body && typeof opts.body === 'string'){
      var u = (typeof url === 'string') ? url : (url && url.url) || '';
      if (u.indexOf('/api/anthropic') === 0 || u.indexOf('/api/openai') === 0){
        try {
          var body = JSON.parse(opts.body);
          // Don't add to our own translator calls
          if (body.system && /Ghanaian language translator/.test(body.system)){
            return origFetch.apply(this, arguments);
          }
          if (body.messages && body.messages.length){
            body.system = (body.system || '') + LTLang.promptInstruction();
            opts = Object.assign({}, opts, { body: JSON.stringify(body) });
          }
        } catch(e){}
      }
    }
    return origFetch.call(this, url, opts);
  };
}

// ─── First-visit detection ──────────────────────────────────────
function maybeShowFirstVisit(){
  try {
    if (localStorage.getItem(SEEN_PICKER_KEY)) return;
  } catch(e){}
  // Only show if we don't have a stored language already
  if (loadStoredLang()) return;
  // Wait a moment so the page renders behind it
  setTimeout(function(){ renderModal(true); }, 1200);
}

// ─── Boot ───────────────────────────────────────────────────────
function boot(){
  cache = loadCache();
  primeSeed();
  var stored = loadStoredLang();
  if (stored){ currentLang = stored; }
  ensureLanguageButton();
  patchAICalls();
  installNavHook();
  if (currentLang !== 'en') applyToDocument();
  startObserver();
  maybeShowFirstVisit();
}

// Re-mount the button if other scripts re-render the nav
setInterval(ensureLanguageButton, 2000);

// Sync language preference from cloud profile on hydration
window.addEventListener('lt-cloud-hydrated', function(){
  if (window._LT_LAST_PROFILE && window._LT_LAST_PROFILE.language){
    if (LANGS[window._LT_LAST_PROFILE.language] && window._LT_LAST_PROFILE.language !== currentLang){
      LTLang.set(window._LT_LAST_PROFILE.language, { silent: true });
    }
  }
});

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

})();
