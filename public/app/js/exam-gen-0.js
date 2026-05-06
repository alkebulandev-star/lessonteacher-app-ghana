/* ════════════════════════════════════════════════════════════════
   THEORY-PAPER GENERATOR (canonical)
   ────────────────────────────────────────────────────────────────
   Generates fresh theory / Paper-2 exam papers that match the real
   structure of WAEC, WASSCE, WASSCE, and BECE per subject and per
   syllabus area.

   Architecture:
     1. PAPER_SPEC[board][subject] = canonical structure
        (number of questions, sections, types, topics, marks, time)
     2. buildSystemPrompt(board, subject, lang) reads the spec and
        produces a precise system prompt for the AI.
     3. ExamGen.generate({board, subject, paperType}) runs Anthropic
        first, falls back to OpenAI on error. Returns a normalised
        list of theory questions in the same shape the existing
        startEssayWriting() expects.
     4. The language layer (lang-0.js) wraps the fetch and adds a
        "respond in [language]" instruction — so the same generator
        produces Twi / Ewe / Ga / English papers without code
        changes here.

   Public API:
     ExamGen.generate({board, subject, paperType, count?})
       → Promise<[{type, q, parts?, yr?}, ...]>
     ExamGen.hasSpec(board, subject) → bool
     ExamGen.getSpec(board, subject) → spec object or null

   Lessons + per-question AI continue to use Anthropic primarily
   (LT_SERVER='1' default) with OpenAI as fallback. Translation is
   the only thing that goes exclusively through OpenAI.
   ════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

// ─── Paper specifications ─────────────────────────────────────
// Each spec describes: how many questions, what sections, what
// topic areas to draw from, which question types are valid, time
// allocation, and any board-specific quirks.

var WAEC_GENERIC = {
  board: 'WAEC',
  paperLabel: 'Paper 2 — Theory',
  duration: 90,           // minutes total
  questionsToShow: 5,     // candidates answer any 3 of these 5
  questionsToAnswer: 3,
  marksPerQuestion: 20,
  notes: [
    'Senior Secondary Certificate Examination (SSCE)',
    'WAEC Paper 2 is structured-essay style. Each question typically has parts (a), (b), (c) with marks indicated.',
    'Time per question approximately 30 minutes.'
  ]
};

var WAEC_ENG = {
  board:'WAEC', subject:'English Language', paperLabel:'Paper 2 — Essay & Comprehension',
  duration: 120,
  questionsToShow: 5, questionsToAnswer: 1,
  marksPerQuestion: 50,
  essayTypes: ['Argumentative', 'Narrative', 'Formal letter', 'Informal letter', 'Article', 'Speech', 'Descriptive', 'Report'],
  wordCount: 'not less than 450 words',
  notes: [
    'Section A is the essay — candidate chooses 1 of 5 topics from different essay types.',
    'Each topic should be a different essay type.',
    'Topics should reflect Ghanaian student life: school, community, current issues, personal experiences.',
    'Year-of-publication style: WAEC essay topics are timeless prompts — avoid dated current-affairs references.'
  ]
};

var WAEC_MATH = {
  board:'WAEC', subject:'Mathematics', paperLabel:'Paper 2 — Theory',
  duration: 150,
  questionsToShow: 13, questionsToAnswer: 10,
  marksPerQuestion: 10,
  syllabusAreas: [
    'Number & Numeration (number bases, fractions, indices, logarithms, sequences, sets, surds)',
    'Algebraic Processes (equations, inequalities, variation, factorisation, simultaneous equations)',
    'Mensuration (length, area, volume, surface area)',
    'Plane Geometry (angles, polygons, circles, triangles, similarity, trigonometric ratios)',
    'Trigonometry (sine rule, cosine rule, bearings, heights and distances)',
    'Statistics & Probability (mean, median, mode, range, variance, std deviation, probability)',
    'Coordinate Geometry (gradient, distance, midpoint, equation of a line)',
    'Calculus (basic differentiation and integration — for general maths only at intro level)'
  ],
  notes: [
    'Each question must have parts (a) and (b), often (c). Show marks per part: e.g. (5 marks), (5 marks).',
    'Use Ghanaian context for word problems: GH₵ amounts, Accra/Tamale/Kumasi, named characters (Kwame, Adwoa, Kojo, Ama, Yaw, Akosua).',
    'Number questions Q1, Q2, ... in the JSON.',
    'Mix calculation, proof, construction, and application — not all numerical.'
  ]
};

var WAEC_BIO = {
  board:'WAEC', subject:'Biology', paperLabel:'Paper 2 — Theory & Essay',
  duration: 120,
  questionsToShow: 6, questionsToAnswer: 5,
  marksPerQuestion: 20,
  syllabusAreas: [
    'The Cell (structure, organelles, division — mitosis & meiosis)',
    'Living and Non-Living Things (characteristics)',
    'Plant Kingdom (classification, anatomy, photosynthesis, transpiration)',
    'Animal Kingdom (classification, nutrition, respiration, circulation, excretion, nervous system, reproduction)',
    'Ecology (food chains, ecosystems, pollution, conservation)',
    'Reproduction in Plants and Animals (including human reproductive system)',
    'Genetics (Mendelian inheritance, sex determination, variation)',
    'Evolution (theories, evidence, natural selection)',
    'Microorganisms and Diseases'
  ],
  notes: [
    'Mix structured questions (with parts a, b, c, d) with diagram-labelling questions.',
    'At least one question should ask candidate to "draw and label" a diagram.',
    'Use Ghanaian/West African examples for ecology questions (e.g. mangrove swamps, rain forest, savannah).',
    'For health questions, reference Ghanaian disease context: malaria, typhoid, sickle cell, cholera.'
  ]
};

var WAEC_CHM = {
  board:'WAEC', subject:'Chemistry', paperLabel:'Paper 2 — Theory',
  duration: 120,
  questionsToShow: 6, questionsToAnswer: 5,
  marksPerQuestion: 20,
  syllabusAreas: [
    'Atomic Structure & Periodic Table',
    'Chemical Bonding',
    'States of Matter (gas laws, solids, liquids)',
    'Energy Changes (enthalpy, exothermic/endothermic)',
    'Acids, Bases, Salts (definitions, indicators, neutralisation)',
    'Oxidation–Reduction (redox reactions, oxidation numbers)',
    'Stoichiometry (mole concept, calculations, formulae)',
    'Electrochemistry (electrolysis, electrolytic cells, Faraday)',
    'Kinetics & Equilibrium',
    'Organic Chemistry (alkanes, alkenes, alkynes, alcohols, carboxylic acids, esters)',
    'Industrial Chemistry (Haber, contact, Solvay processes)'
  ],
  notes: [
    'Each question MUST allow numerical calculation in at least one part — chemistry is calculation-heavy.',
    'Use the exact periodic table values WAEC provides (relative atomic masses).',
    'Equations must be balanced. State symbols required: (s), (l), (g), (aq).',
    'Practical-style questions allowed (describe a test for, identify the gas evolved, etc).'
  ]
};

var WAEC_PHY = {
  board:'WAEC', subject:'Physics', paperLabel:'Paper 2 — Theory',
  duration: 120,
  questionsToShow: 6, questionsToAnswer: 5,
  marksPerQuestion: 20,
  syllabusAreas: [
    'Mechanics (motion, Newton\'s laws, friction, momentum, work, energy, power)',
    'Heat (temperature, thermal expansion, heat capacity, latent heat, gas laws)',
    'Waves & Sound',
    'Light (reflection, refraction, lenses, optical instruments)',
    'Electricity (current, voltage, resistance, Ohm\'s law, circuits, capacitance)',
    'Magnetism & Electromagnetism',
    'Modern Physics (atomic structure, radioactivity, nuclear reactions, photoelectric effect)',
    'Pressure, Density, Hydrostatics'
  ],
  notes: [
    'Most parts should require numerical calculation. Show units throughout.',
    'Use SI units strictly.',
    'Diagrams required for optics, circuits, and force-vector questions.',
    'g = 10 m/s² unless otherwise stated.'
  ]
};

var WAEC_GEO = {
  board:'WAEC', subject:'Geography', paperLabel:'Paper 2 — Theory',
  duration: 120,
  questionsToShow: 7, questionsToAnswer: 5,
  marksPerQuestion: 20,
  syllabusAreas: [
    'Physical Geography (earth structure, weather, climate, rocks, soils)',
    'Map Reading & Interpretation',
    'Population Geography',
    'Economic Geography (agriculture, mining, manufacturing, trade)',
    'Geography of Ghana (relief, drainage, vegetation, climate, mineral resources)',
    'Geography of West Africa',
    'Settlement Geography (urban and rural)',
    'Transport and Communication'
  ],
  notes: [
    'Always include at least one map-related question (sketch, identify features, give bearings).',
    'Always include at least one Ghana-specific question.',
    'Use case-study format for economic activities — name specific places.'
  ]
};

var WAEC_GOV = {
  board:'WAEC', subject:'Government', paperLabel:'Paper 2 — Theory & Essay',
  duration: 120,
  questionsToShow: 8, questionsToAnswer: 4,
  marksPerQuestion: 25,
  syllabusAreas: [
    'Basic Concepts (state, sovereignty, government, power, authority, legitimacy)',
    'Forms of Government (democracy, monarchy, federation, unitary, confederal)',
    'Political Ideologies (capitalism, socialism, communism)',
    'Constitution and Constitutionalism',
    'Organs of Government (executive, legislature, judiciary)',
    'Pre-Colonial Political Systems in Ghana (Asante / Akan, Mole-Dagbani, Ga-Adangbe, Ewe)',
    'Ghanaian Political History (1957 independence, Nkrumah, republics, military rule, 1992 Fourth Republic)',
    'Public Service and Civil Service',
    'Political Parties & Pressure Groups',
    'Elections and Electoral Systems',
    'International Relations (ECOWAS, AU, UN, OPEC)'
  ],
  notes: [
    'Essay-style answers expected — at least 8-10 well-developed points per question.',
    'For Ghanaian-history questions, give dates and specific actors.',
    'Define key terms before discussing — examiners reward this.'
  ]
};

var WAEC_ECO = {
  board:'WAEC', subject:'Economics', paperLabel:'Paper 2 — Theory',
  duration: 120,
  questionsToShow: 8, questionsToAnswer: 5,
  marksPerQuestion: 20,
  syllabusAreas: [
    'Basic Economic Concepts (scarcity, choice, opportunity cost)',
    'Demand, Supply, Price Determination, Elasticity',
    'Production (factors, types, scale)',
    'Money, Banking, Inflation',
    'Public Finance (taxation, government revenue and expenditure)',
    'National Income (GDP, GNP, NNP)',
    'International Trade and Balance of Payments',
    'Economic Development & Planning (Ghanaian National Development Plans)',
    'Agriculture, Industry, and Petroleum in the Ghanaian Economy',
    'Population and Labour'
  ],
  notes: [
    'Mix definitional, diagrammatic (demand/supply curves), and discussion-style questions.',
    'Use Ghanaian context for examples: GNPC, Bank of Ghana, Cedi, recent budgets.'
  ]
};

var WAEC_LIT = {
  board:'WAEC', subject:'Literature in English', paperLabel:'Paper 2 — Essay',
  duration: 120,
  questionsToShow: 8, questionsToAnswer: 4,
  marksPerQuestion: 25,
  notes: [
    'Three sections: African Drama, Non-African Drama, Poetry. Candidates answer 4 questions, including at least one from each section.',
    'Questions ask candidates to discuss themes, characters, plot, language, and dramatic/poetic devices in a SET TEXT.',
    'Phrase questions abstractly enough that they apply to any text the candidate has studied — e.g. "Discuss the role of women in any ONE drama text you have studied."',
    'Use the wording: "any ONE text you have studied", "any TWO poems you have studied".',
    'Word count: not less than 400 words per essay.'
  ]
};

var WAEC_AGR = {
  board:'WAEC', subject:'Agricultural Science', paperLabel:'Paper 2 — Theory',
  duration: 120,
  questionsToShow: 6, questionsToAnswer: 5,
  marksPerQuestion: 20,
  syllabusAreas: [
    'Importance of Agriculture',
    'Agricultural Ecology and Soil Science',
    'Crop Production (cereals, legumes, root crops, vegetables, tree crops)',
    'Livestock Production (cattle, sheep, goats, pigs, poultry)',
    'Fisheries and Forestry',
    'Agricultural Economics, Marketing, Cooperatives',
    'Farm Mechanisation and Tools',
    'Pest, Diseases and Their Control',
    'Land Use and Tenure Systems in Ghana'
  ],
  notes: [
    'Use Ghanaian crops and livestock: yam, cassava, cocoa, oil palm, groundnut, rice, Sanga cattle, west african dwarf goat.',
    'Practical, applied tone. Reference real Ghanaian farming practices.'
  ]
};

// WASSCE mostly mirrors WAEC structure, with these differences applied per subject:
//   • 5 options for some objective papers (handled in Paper 1, not here)
//   • Slightly more questions in Paper 2 essay sections
//   • Identical syllabus areas for the most part
function fromWaec(spec, overrides){
  var out = Object.assign({}, spec, overrides || {});
  out.board = 'WASSCE';
  return out;
}

var WASSCE_SPECS = {
  eng: fromWaec(WAEC_ENG, { paperLabel:'WASSCE Paper 2 — Essay & Composition' }),
  mth: fromWaec(WAEC_MATH, { questionsToShow: 12, questionsToAnswer: 10, paperLabel:'WASSCE Paper 2 — Theory' }),
  bio: fromWaec(WAEC_BIO, {}),
  chm: fromWaec(WAEC_CHM, {}),
  phy: fromWaec(WAEC_PHY, {}),
  geo: fromWaec(WAEC_GEO, {}),
  gov: fromWaec(WAEC_GOV, {}),
  eco: fromWaec(WAEC_ECO, {}),
  lit: fromWaec(WAEC_LIT, {}),
  agr: fromWaec(WAEC_AGR, {})
};

// WASSCE CBT — Paper 1 only, all objective. Theory papers don't apply.
// We still register specs so AI fallback knows WASSCE has no theory paper.
var WASSCE_NOTE = {
  board: 'WASSCE',
  paperLabel: 'WASSCE CBT — All questions are objective (Paper 1)',
  duration: 0,
  questionsToShow: 0, questionsToAnswer: 0,
  marksPerQuestion: 0,
  notes: [
    'WASSCE CBT does not have a theory paper. The Paper-2 / Theory route should NOT be available for WASSCE.',
    'If a user reaches this generator with board=WASSCE, the response should explain WASSCE is objective-only and redirect to Paper 1.'
  ]
};

// BECE — Junior Secondary Certificate. Different subject set.
var BECE_GENERIC = {
  board: 'BECE',
  paperLabel: 'BECE Paper 2 — Theory',
  duration: 90,
  questionsToShow: 5, questionsToAnswer: 4,
  marksPerQuestion: 20,
  notes: [
    'Junior Secondary level — JHS 3 (ages 13-15).',
    'Use simpler vocabulary. Concrete, familiar examples.',
    'Time per question approximately 20 minutes.'
  ]
};

var BECE_ENG = Object.assign({}, BECE_GENERIC, {
  subject:'English Language',
  paperLabel: 'BECE Paper 2 — Essay & Comprehension',
  questionsToShow: 4, questionsToAnswer: 1, marksPerQuestion: 30,
  essayTypes: ['Narrative', 'Article', 'Letter to a friend', 'Description', 'Report'],
  wordCount: 'between 250 and 350 words',
  notes: [
    'JHS 3-level essay topics. Familiar contexts only.',
    'Avoid topics that need adult experience (e.g. workplace, politics).'
  ]
});

var BECE_MATH = Object.assign({}, BECE_GENERIC, {
  subject:'Mathematics',
  questionsToShow: 6, questionsToAnswer: 5,
  syllabusAreas: [
    'Whole numbers, fractions, decimals, percentages',
    'Approximation and estimation',
    'Basic algebra (simple equations, substitution)',
    'Mensuration (perimeter, area, volume of basic shapes)',
    'Geometry (angles, triangles, quadrilaterals, basic constructions)',
    'Statistics (frequency tables, mean, mode, median, basic graphs)',
    'Number bases (binary)',
    'Sets',
    'Financial arithmetic (simple interest, profit, loss, ratio)'
  ],
  notes: [
    'Numbers should be small and friendly. Avoid scientific notation.',
    'Use Ghanaian context: classroom, market, family.'
  ]
});

var BECE_BST = Object.assign({}, BECE_GENERIC, {
  subject:'Integrated Science & Technology',
  syllabusAreas: [
    'Living and non-living things',
    'Plants and animals (basic classification)',
    'Human body (digestion, breathing, circulation — JHS level)',
    'Reproduction in humans (puberty, family life, HIV/AIDS basics)',
    'Energy and its uses',
    'Force, motion and simple machines',
    'Heat, light, sound (basics)',
    'Magnetism and electricity (basics)',
    'Environmental pollution and conservation',
    'Drug abuse and effects'
  ],
  notes: ['Define terms first; keep examples concrete and visual.']
});

var BECE_CRS = Object.assign({}, BECE_GENERIC, {
  subject:'Christian Religious Studies',
  syllabusAreas: [
    'Old Testament: creation, the patriarchs, Moses, the Judges, the kings (Saul, David, Solomon)',
    'New Testament: birth and ministry of Jesus, parables, miracles, the Crucifixion and Resurrection',
    'Early Church and Acts of the Apostles',
    'Christian moral living (honesty, love, forgiveness, hard work)',
    'Christian response to social issues'
  ],
  notes: ['Reference Bible passages with chapter and verse where appropriate.']
});

var BECE_NV = Object.assign({}, BECE_GENERIC, {
  subject:'National Values (Social Studies + Social Studies + Security Education)',
  syllabusAreas: [
    'Citizenship and rights and duties',
    'Democracy and constitution (basic)',
    'Federal character',
    'Drug abuse, cultism, examination malpractice',
    'Ghanaian unity and national integration',
    'Values: honesty, integrity, discipline'
  ],
  notes: ['Use real Ghanaian examples and recent civic education themes.']
});

// ─── Registry ─────────────────────────────────────────────────
// Lookup keyed by board + subjectKey-prefix (e.g. 'eng', 'mth', 'bio')
var REGISTRY = {
  WAEC: {
    eng:  WAEC_ENG,
    mth:  WAEC_MATH,
    bio:  WAEC_BIO,
    chm:  WAEC_CHM,
    phy:  WAEC_PHY,
    geo:  WAEC_GEO,
    gov:  WAEC_GOV,
    eco:  WAEC_ECO,
    lit:  WAEC_LIT,
    agr:  WAEC_AGR
  },
  WASSCE: WASSCE_SPECS,
  WASSCE: { _note: WASSCE_NOTE },
  BECE: {
    eng: BECE_ENG,
    mth: BECE_MATH,
    bsc: BECE_BST, bst: BECE_BST,
    crs: BECE_CRS,
    irs: Object.assign({}, BECE_GENERIC, { subject:'Islamic Religious Studies', syllabusAreas:[
      'Tawhid (oneness of Allah)','Pillars of Islam','The Prophet Muhammad (PBUH)','Qur\'an basics',
      'Hadith and Sunnah','Islamic ethics and moral conduct','Family life in Islam'
    ], notes:['Reference Qur\'an surahs and Hadiths where appropriate.'] }),
    nv:  BECE_NV
  }
};

// Generic fallback for any subject not in the registry — board-aware.
function genericSpec(board, subjectKey, subjectName){
  var bg = (board === 'BECE') ? BECE_GENERIC : WAEC_GENERIC;
  return Object.assign({}, bg, {
    subject: subjectName || subjectKey,
    syllabusAreas: ['Use the standard NaCCA syllabus topics for ' + (subjectName || subjectKey) + ' at the appropriate level.'],
    notes: bg.notes.concat([
      'No board-specific spec is registered for this subject. Generate questions following the general structure and topic scope of the NaCCA senior-secondary curriculum for ' + (subjectName || subjectKey) + '.'
    ])
  });
}

// ─── Subject key normalisation ────────────────────────────────
// The site uses keys like 'eng-s2', 'mth-s3', 'bio-p1'. Strip the
// suffix to get the base subject prefix.
function normaliseSubjectKey(rawKey){
  if (!rawKey) return '';
  return String(rawKey).toLowerCase().replace(/-[a-z0-9]+$/, '');
}

function normaliseBoard(b){
  return String(b||'').toUpperCase().replace(/[^A-Z]/g,'');
}

// ─── Public API ────────────────────────────────────────────────
var ExamGen = {
  hasSpec: function(board, subject){
    var b = normaliseBoard(board);
    var s = normaliseSubjectKey(subject);
    return !!(REGISTRY[b] && REGISTRY[b][s]);
  },
  getSpec: function(board, subject){
    var b = normaliseBoard(board);
    var s = normaliseSubjectKey(subject);
    if (REGISTRY[b] && REGISTRY[b][s]) return REGISTRY[b][s];
    return null;
  },
  // Returns [{ type:'...', q:'...', yr:'2024 (AI)' }, ...]
  generate: async function(opts){
    opts = opts || {};
    var board = normaliseBoard(opts.board || 'WAEC');
    var subjectKey = normaliseSubjectKey(opts.subject || 'eng');
    var subjectName = opts.subjectName || subjectKey;

    if (board === 'WASSCE'){
      // WASSCE has no theory paper.
      throw new Error('WASSCE does not have a theory paper. Use Paper 1 (objective) instead.');
    }

    var spec = (REGISTRY[board] && REGISTRY[board][subjectKey]) || genericSpec(board, subjectKey, subjectName);
    var count = opts.count || spec.questionsToShow || 5;

    var system = buildSystemPrompt(spec, subjectName, count);
    var user = 'Generate ' + count + ' theory questions for a ' + spec.board + ' ' + (spec.subject || subjectName) + ' Paper 2. Output ONLY the JSON array. No preamble.';

    // Try Anthropic primary, OpenAI fallback. Lessons + this generator
    // both use Anthropic primarily. Translation is the only thing that
    // exclusively goes through OpenAI.
    var raw = await callAI(system, user);
    var arr = parseJSON(raw);
    if (!arr || !arr.length){
      // Retry once with a simpler instruction
      try {
        raw = await callAI(system + '\n\nIf JSON parsing failed before, ensure you output valid, parseable JSON now.', user);
        arr = parseJSON(raw);
      } catch(e){}
    }
    if (!arr || !arr.length){
      throw new Error('Could not generate paper from AI response.');
    }
    // Normalise to the existing topic shape
    return arr.map(function(item, i){
      return {
        type: item.type || ('Question ' + (i + 1)),
        q: item.q || item.question || '',
        parts: item.parts || null,
        yr: item.yr || (new Date().getFullYear() + ' (AI)')
      };
    });
  }
};

// ─── Prompt construction ──────────────────────────────────────
function buildSystemPrompt(spec, subjectName, count){
  var lines = [
    'You are a senior examiner generating a fresh ' + spec.board + ' Paper 2 (Theory) for ' + (spec.subject || subjectName) + '.',
    '',
    'PAPER STRUCTURE:',
    '- Number of questions to generate: ' + count,
    '- Marks per question: ' + spec.marksPerQuestion,
    '- Questions candidates will answer: ' + (spec.questionsToAnswer || count) + ' of ' + (spec.questionsToShow || count),
    '- Total time: ' + spec.duration + ' minutes',
    ''
  ];
  if (spec.essayTypes){
    lines.push('ESSAY TYPES (each question must use a different type):');
    spec.essayTypes.forEach(function(t){ lines.push('  • ' + t); });
    lines.push('');
    if (spec.wordCount) lines.push('Word count expected: ' + spec.wordCount);
    lines.push('');
  }
  if (spec.syllabusAreas && spec.syllabusAreas.length){
    lines.push('SYLLABUS AREAS — draw questions from these. Spread across different areas; do NOT clump in one topic:');
    spec.syllabusAreas.forEach(function(a, i){ lines.push('  ' + (i+1) + '. ' + a); });
    lines.push('');
  }
  if (spec.notes && spec.notes.length){
    lines.push('BOARD-SPECIFIC GUIDANCE:');
    spec.notes.forEach(function(n){ lines.push('  • ' + n); });
    lines.push('');
  }
  lines.push('OUTPUT FORMAT — JSON array, no preamble, no code fences.');
  lines.push('Each item: { "type": "<question type or topic area>", "q": "<full question text including parts (a)(b)(c) if structured>", "parts": [optional array of {label, text}] }');
  lines.push('');
  lines.push('EXAMPLE (English Paper 2, 1 essay topic):');
  lines.push('[{"type":"Argumentative","q":"Some say social media has done more harm than good to Ghanaian youth. Write an article for a national newspaper expressing your view. Your article should not be less than 450 words."}]');
  lines.push('');
  lines.push('EXAMPLE (Mathematics Paper 2, 1 question):');
  lines.push('[{"type":"Algebra","q":"(a) Solve the simultaneous equations: 2x + 3y = 12 and 4x − y = 10. (5 marks) (b) A trader bought 60 oranges at GH₵25 each. He sold 45 at GH₵40 each and the rest at GH₵20 each. Calculate his profit or loss. (5 marks)"}]');
  lines.push('');
  lines.push('CRITICAL: Output ONLY the JSON array. No explanation, no introduction, no closing remarks.');
  return lines.join('\n');
}

// ─── AI call with primary→fallback ────────────────────────────
async function callAI(system, user){
  var body = {
    model: 'claude-sonnet-4-5',
    max_tokens: 3500,
    system: system,
    messages: [{ role:'user', content: user }]
  };
  // Try Anthropic first
  try {
    var res = await fetch('/api/anthropic', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(body)
    });
    if (res.ok){
      var d = await res.json();
      var t = pluckText(d);
      if (t) return t;
    }
  } catch(e){
    console.warn('[ExamGen] anthropic failed, falling back to openai', e);
  }
  // Fallback OpenAI
  try {
    var res2 = await fetch('/api/openai', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(body)
    });
    if (res2.ok){
      var d2 = await res2.json();
      var t2 = pluckText(d2);
      if (t2) return t2;
    }
  } catch(e){
    console.warn('[ExamGen] openai also failed', e);
  }
  throw new Error('Both AI providers failed.');
}

function pluckText(data){
  if (!data) return '';
  if (data.content && data.content[0] && data.content[0].text) return data.content[0].text;
  if (typeof data.content === 'string') return data.content;
  if (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) return data.choices[0].message.content;
  return '';
}

// Extract JSON array from raw text (handles markdown fences, prose preamble)
function parseJSON(text){
  if (!text) return null;
  var s = String(text).trim();
  s = s.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```\s*$/, '').trim();
  var first = s.indexOf('[');
  if (first < 0) return null;
  var depth = 0, end = -1;
  for (var i = first; i < s.length; i++){
    if (s[i] === '[') depth++;
    else if (s[i] === ']'){ depth--; if (depth === 0){ end = i; break; } }
  }
  if (end < 0) return null;
  var slice = s.slice(first, end + 1);
  // Tolerant cleanup
  slice = slice
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/,(\s*[}\]])/g, '$1');
  try {
    var parsed = JSON.parse(slice);
    if (Array.isArray(parsed)) return parsed;
  } catch(e){
    console.warn('[ExamGen] JSON parse failed', e);
  }
  return null;
}

window.ExamGen = ExamGen;

})();
