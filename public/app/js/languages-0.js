
// ══════════════ LANGUAGE MODULE DATA ══════════════
window.LT_LANGUAGES = {
  twi: {
    name:'Twi (Akan)', flag:'🇬🇭', color:'#dc2626',
    intro:'Twi is the most widely spoken language in Ghana, used across the Ashanti, Eastern, Bono and Central regions. It is tonal — high and low tones change meaning.',
    greetings:[
      {twi:'Maakye',           en:'Good morning',          note:'Until about midday'},
      {twi:'Maaha',            en:'Good afternoon',        note:'Midday until about 4pm'},
      {twi:'Maadwo',           en:'Good evening',          note:'After 4pm'},
      {twi:'Ɛte sɛn?',         en:'How are you?',          note:'Most common greeting'},
      {twi:'Eyɛ',              en:'I am fine',             note:'Standard reply'},
      {twi:'Medaase',          en:'Thank you',             note:'Universal thanks'},
      {twi:'Mepa wo kyɛw',     en:'Please',                note:'Polite request'},
      {twi:'Akwaaba',          en:'Welcome',               note:'Famous Ghanaian welcome'},
      {twi:'Nante yiye',       en:'Goodbye',               note:'Literally "walk well"'},
    ],
    phrases:[
      {twi:'Me din de…',       en:'My name is…'},
      {twi:'Woadidi anaa?',    en:'Have you eaten?'},
      {twi:'Medɔ wo',          en:'I love you'},
      {twi:'Mehia mmoa',       en:'I need help'},
      {twi:'Ɛwɔ he?',          en:'Where is it?'},
      {twi:'Ɛyɛ sɛn?',         en:'How much is it?'},
    ],
    tip:'Tip: Twi has special letters Ɛ/ɛ (open "e") and Ɔ/ɔ (open "o"). Tones matter — "papa" (good) vs "pápá" (father).'
  },
  ewe: {
    name:'Ewe', flag:'🇬🇭', color:'#059669',
    intro:'Ewe is spoken across the Volta and Oti regions of Ghana, plus Togo and Benin. It is tonal and uses several special letters.',
    greetings:[
      {ewe:'Ŋdi',              en:'Good morning',          note:'Short morning greeting'},
      {ewe:'Ŋdɔ',              en:'Good afternoon',        note:''},
      {ewe:'Fiẽ',              en:'Good evening',          note:''},
      {ewe:'Èfɔ̀a?',           en:'How are you?',          note:'Lit. "Are you awake?"'},
      {ewe:'Mefɔ',             en:'I am fine',             note:'Standard reply'},
      {ewe:'Akpe',             en:'Thank you',             note:''},
      {ewe:'Meɖe kuku',        en:'Please',                note:''},
      {ewe:'Woezɔ',            en:'Welcome',               note:''},
      {ewe:'Heyi nyuie',       en:'Goodbye',               note:'Lit. "Go well"'},
    ],
    phrases:[
      {ewe:'Ŋkɔnye enye…',     en:'My name is…'},
      {ewe:'Èɖu nu xoxo a?',   en:'Have you eaten?'},
      {ewe:'Melɔ̃ wò',         en:'I love you'},
      {ewe:'Mehiã kpekpeɖeŋu', en:'I need help'},
      {ewe:'Afi ka wòle?',     en:'Where is it?'},
      {ewe:'Home si?',         en:'How much is it?'},
    ],
    tip:'Tip: Ewe uses ɖ, ƒ, ɣ, ŋ, ʋ — each is a single distinct sound. The tone marks above vowels (à, á) change meaning.'
  },
  ga: {
    name:'Ga', flag:'🇬🇭', color:'#f59e0b',
    intro:'Ga is the language of the Greater Accra Region — spoken across Accra, Tema and the coastal Ga-Adangme communities.',
    greetings:[
      {ga:'Ojekoo',           en:'Good morning',          note:''},
      {ga:'Oshwiebii',        en:'Good afternoon',        note:''},
      {ga:'Ojabaa',           en:'Good evening',          note:''},
      {ga:'Te oyɔɔ tɛŋŋ?',    en:'How are you?',          note:'Common greeting'},
      {ga:'Ojogbaŋŋ',         en:'I am fine',             note:'Standard reply'},
      {ga:'Oyiwaladɔŋŋ',      en:'Thank you',             note:''},
      {ga:'Ofainɛ',           en:'Please',                note:''},
      {ga:'Ogekoo',           en:'Welcome',               note:''},
      {ga:'Yaa wɔ ojogbaŋŋ',  en:'Goodbye',               note:'Lit. "Go in peace"'},
    ],
    phrases:[
      {ga:'Migbɛi ji…',       en:'My name is…'},
      {ga:'Oye nii momo?',    en:'Have you eaten?'},
      {ga:'Misumɔɔ bo',       en:'I love you'},
      {ga:'Mihia yelikɛbuamɔ',en:'I need help'},
      {ga:'Eyɔɔ nɛɛ?',        en:'Where is it?'},
      {ga:'Ekãa enyɔ?',       en:'How much is it?'},
    ],
    tip:'Tip: Ga uses ɛ, ɔ and ŋ as distinct sounds. Doubled vowels (aa, ɛɛ) are held longer — they change meaning.'
  },
  pidgin: {
    name:'Ghanaian Pidgin', flag:'🎵', color:'#0284c7',
    intro:'Pidgin is Ghana\'s most democratic language — spoken by everyone from market traders to university students. No formal rules, just vibes and context.',
    greetings:[
      {pcm:'How far?',         en:'How are you?',          note:'Standard casual greeting'},
      {pcm:'You good?',        en:'Are you okay?',         note:'Check-in greeting'},
      {pcm:'I dey',            en:'I am here / I am fine', note:'Standard reply'},
      {pcm:'Wetin dey happen?',en:'What is happening?',    note:'What\'s up'},
      {pcm:'Nothing much',     en:'Nothing much',          note:''},
      {pcm:'Abeg',             en:'Please',                note:'Very common'},
      {pcm:'Thank you o',      en:'Thank you',             note:'The "o" adds emphasis'},
      {pcm:'Safe',             en:'Goodbye',               note:'Casual'},
      {pcm:'See you later',    en:'See you later',         note:''},
    ],
    phrases:[
      {pcm:'My name na…',      en:'My name is…'},
      {pcm:'You don chop?',    en:'Have you eaten?'},
      {pcm:'I like you die',   en:'I like you a lot'},
      {pcm:'Help me abeg',     en:'Please help me'},
      {pcm:'Where e dey?',     en:'Where is it?'},
      {pcm:'No wahala',        en:'No problem'},
      {pcm:'How much?',        en:'How much? (price)'},
      {pcm:'E too cost',       en:'It\'s too expensive'},
    ],
    tip:'Tip: Adding "o" at the end of words adds emphasis. "Thank you o" is warmer than "Thank you". "Abeg o" means "please, seriously".'
  },
  french: {
    name:'French', flag:'🇫🇷', color:'#2563eb',
    intro:'French is a WASSCE & WAEC language and the working language across much of West Africa — Benin, Togo, Côte d\'Ivoire, Senegal. A real career advantage.',
    greetings:[
      {fr:'Bonjour',          en:'Good morning / Hello',  note:'Until late afternoon'},
      {fr:'Bonsoir',          en:'Good evening',          note:''},
      {fr:'Salut',            en:'Hi (informal)',         note:'Friends only'},
      {fr:'Comment ça va?',   en:'How are you?',          note:'Casual'},
      {fr:'Ça va bien, merci',en:'I am well, thank you',  note:''},
      {fr:'Merci beaucoup',   en:'Thank you very much',   note:''},
      {fr:'S\'il vous plaît', en:'Please',                note:'Polite form'},
      {fr:'Au revoir',        en:'Goodbye',               note:''},
    ],
    phrases:[
      {fr:'Je m\'appelle…',   en:'My name is…'},
      {fr:'Je ne comprends pas',en:'I don\'t understand'},
      {fr:'Où sont les toilettes?',en:'Where is the toilet?'},
      {fr:'C\'est combien?',  en:'How much is it?'},
      {fr:'J\'ai besoin d\'aide',en:'I need help'},
    ],
    tip:'Tip: French nouns have gender — le (masculine), la (feminine). Memorise gender with each new word.'
  },
  spanish: {
    name:'Spanish', flag:'🇪🇸', color:'#dc2626',
    intro:'Spanish is the world\'s 2nd most-spoken native language. Easy to start, useful for football, music, travel and global business.',
    greetings:[
      {es:'Hola',             en:'Hello',                 note:'Universal'},
      {es:'Buenos días',      en:'Good morning',          note:''},
      {es:'Buenas tardes',    en:'Good afternoon',        note:''},
      {es:'¿Cómo estás?',     en:'How are you?',          note:'Informal'},
      {es:'Estoy bien',       en:'I am well',             note:''},
      {es:'Gracias',          en:'Thank you',             note:''},
      {es:'Por favor',        en:'Please',                note:''},
      {es:'Adiós',            en:'Goodbye',               note:''},
    ],
    phrases:[
      {es:'Me llamo…',        en:'My name is…'},
      {es:'No entiendo',      en:'I don\'t understand'},
      {es:'¿Dónde está…?',    en:'Where is…?'},
      {es:'¿Cuánto cuesta?',  en:'How much does it cost?'},
      {es:'Necesito ayuda',   en:'I need help'},
    ],
    tip:'Tip: Spanish is mostly phonetic — read it like you see it. "ñ" sounds like "ny" in canyon.'
  },
  arabic: {
    name:'Arabic', flag:'🇸🇦', color:'#15803d',
    intro:'Arabic is essential for Islamic studies, opens scholarships across the Middle East, and is widely spoken in northern Ghana.',
    greetings:[
      {ar:'As-salāmu ʿalaykum',en:'Peace be upon you',    note:'Universal Muslim greeting'},
      {ar:'Wa ʿalaykum as-salām',en:'And upon you peace', note:'Reply'},
      {ar:'Marḥaban',         en:'Hello',                 note:'Neutral'},
      {ar:'Ṣabāḥ al-khayr',   en:'Good morning',          note:''},
      {ar:'Masāʾ al-khayr',   en:'Good evening',          note:''},
      {ar:'Kayfa ḥāluk?',     en:'How are you?',          note:''},
      {ar:'Shukran',          en:'Thank you',             note:''},
      {ar:'Maʿa as-salāmah',  en:'Goodbye',               note:'"With safety"'},
    ],
    phrases:[
      {ar:'Ismī…',            en:'My name is…'},
      {ar:'Lā afham',         en:'I don\'t understand'},
      {ar:'Ayna…?',           en:'Where is…?'},
      {ar:'Bikam hādhā?',     en:'How much is this?'},
      {ar:'Aḥtāj musāʿadah',  en:'I need help'},
    ],
    tip:'Tip: Arabic is read right-to-left. Start by mastering the 28-letter alphabet — pronunciation follows naturally.'
  },
  mandarin: {
    name:'Mandarin', flag:'🇨🇳', color:'#b91c1c',
    intro:'Mandarin opens doors to scholarships in China and global trade. It\'s tonal — like Twi — so Ghanaians often pick up the music quickly.',
    greetings:[
      {zh:'Nǐ hǎo (你好)',    en:'Hello',                 note:'Universal'},
      {zh:'Zǎo shang hǎo',    en:'Good morning',          note:''},
      {zh:'Wǎn shàng hǎo',    en:'Good evening',          note:''},
      {zh:'Nǐ hǎo ma?',       en:'How are you?',          note:''},
      {zh:'Wǒ hěn hǎo',       en:'I am very well',        note:''},
      {zh:'Xièxiè (谢谢)',    en:'Thank you',             note:''},
      {zh:'Qǐng (请)',        en:'Please',                note:''},
      {zh:'Zàijiàn (再见)',   en:'Goodbye',               note:'"See again"'},
    ],
    phrases:[
      {zh:'Wǒ jiào…',         en:'My name is…'},
      {zh:'Wǒ bù dǒng',       en:'I don\'t understand'},
      {zh:'… zài nǎlǐ?',      en:'Where is…?'},
      {zh:'Duōshǎo qián?',    en:'How much money?'},
      {zh:'Qǐng bāng wǒ',     en:'Please help me'},
    ],
    tip:'Tip: Mandarin has 4 tones + a neutral one. Same syllable, different tone = different word. Sing the words; don\'t just say them.'
  },
  dagbani: {
    name:'Dagbani', flag:'🇬🇭', color:'#0891b2',
    intro:'Dagbani is the language of the Dagomba people in northern Ghana — spoken across Tamale, Yendi and the wider Northern Region. It is part of the Mole-Dagbani family.',
    greetings:[
      {dag:'Dasiba',           en:'Good morning',          note:'Standard morning greeting'},
      {dag:'Antire',           en:'Good afternoon',        note:'Midday greeting'},
      {dag:'Aniwula',          en:'Good evening',          note:'After 4pm'},
      {dag:'Naa',              en:'Hello / acknowledgment',note:'Universal'},
      {dag:'A baŋyɛm wula?',   en:'How are you?',          note:'Common greeting'},
      {dag:'Naawuni n-yi tuma',en:'I am fine, by God\'s grace',note:'Standard reply'},
      {dag:'M paɣiya',         en:'Thank you',             note:'Polite thanks'},
      {dag:'Dini soli',        en:'You are welcome',       note:'Welcoming guests'},
      {dag:'Ti ni laɣim',      en:'Goodbye / until we meet',note:'Farewell'},
    ],
    phrases:[
      {dag:'N yu n-nyɛ…',      en:'My name is…'},
      {dag:'A di binda?',      en:'Have you eaten?'},
      {dag:'M yur a',          en:'I love you'},
      {dag:'M bɔri sɔŋsim',    en:'I need help'},
      {dag:'Di be ya?',        en:'Where is it?'},
      {dag:'Di liɣi yɛla?',    en:'How much is it?'},
    ],
    tip:'Tip: Dagbani uses ŋ as a single sound (like "ng" in "sing"). Greetings are very respectful — always greet elders first.'
  },
  fante: {
    name:'Fante', flag:'🇬🇭', color:'#8b5cf6',
    intro:'Fante is spoken in the Central and Western regions of Ghana — Cape Coast, Elmina, and coastal communities.',
    greetings:[
      {fan:'Mema wo akye',      en:'Good morning',          note:''},
      {fan:'Mema wo aha',       en:'Good afternoon',        note:''},
      {fan:'Mema wo adzew',     en:'Good evening',          note:''},
      {fan:'Wo ho te dɛn?',     en:'How are you?',          note:'Most common'},
      {fan:'Me ho yɛ',          en:'I am fine',             note:'Standard reply'},
      {fan:'Medaase',           en:'Thank you',             note:'Related to Twi'},
      {fan:'Akwaaba',           en:'Welcome',               note:'Shared Akan greeting'},
      {fan:'Nantsew yie',       en:'Goodbye',               note:'Go well'},
    ],
    phrases:[
      {fan:'Me dzin dze…',      en:'My name is…'},
      {fan:'Wo adzidzi anaa?',  en:'Have you eaten?'},
      {fan:'Medɔ wo',           en:'I love you'},
      {fan:'Me hia mboa',       en:'I need help'},
      {fan:'Ɔwɔ hen?',          en:'Where is it?'},
      {fan:'Ɛyɛ sɛn?',          en:'How much is it?'},
    ],
    tip:'Tip: Fante is closely related to Twi — both are Akan languages. Fante speakers and Twi speakers understand each other easily.'
  },
  hausa: {
    name:'Hausa', flag:'🇬🇭', color:'#c2410c',
    intro:'Hausa is widely spoken across Northern Ghana and serves as a lingua franca for trade and communication throughout West Africa.',
    greetings:[
      {ha:'Ina kwana',          en:'Good morning',          note:'Lit. "How was the night?"'},
      {ha:'Ina wuni',           en:'Good afternoon',        note:'Lit. "How is the day?"'},
      {ha:'Ina yini',           en:'Good evening',          note:''},
      {ha:'Sannu',              en:'Hello / Greetings',     note:'Universal greeting'},
      {ha:'Lafiya?',            en:'Are you well?',         note:'Common greeting'},
      {ha:'Lafiya lau',         en:'I am fine',             note:'Standard reply'},
      {ha:'Na gode',            en:'Thank you',             note:''},
      {ha:'Don Allah',          en:'Please',                note:'Polite request'},
      {ha:'Sai an jima',        en:'Goodbye',               note:'Lit. "Until later"'},
    ],
    phrases:[
      {ha:'Sunana…',           en:'My name is…'},
      {ha:'Ka ci abinci?',     en:'Have you eaten?'},
      {ha:'Ina son ka',        en:'I love you'},
      {ha:'Ina buƙatar taimako',en:'I need help'},
      {ha:'Ina yake?',         en:'Where is it?'},
      {ha:'Nawa ne?',          en:'How much is it?'},
    ],
    tip:'Tip: Hausa uses several special characters: ɓ, ɗ, ƙ (with hook), and tone marks change meaning. Very widely spoken across West Africa.'
  },

  japanese: {
    name:'Japanese', flag:'🇯🇵', color:'#be123c',
    intro:'Japanese opens anime, technology, culture and study opportunities. Beginners should learn romaji first, then hiragana and katakana.',
    greetings:[
      {ja:'Konnichiwa (こんにちは)', en:'Hello / good afternoon', note:'Universal daytime greeting'},
      {ja:'Ohayō gozaimasu', en:'Good morning', note:'Polite'},
      {ja:'Konbanwa', en:'Good evening', note:''},
      {ja:'Genki desu ka?', en:'How are you?', note:''},
      {ja:'Genki desu', en:'I am fine', note:''},
      {ja:'Arigatō gozaimasu', en:'Thank you very much', note:'Polite'},
      {ja:'Onegaishimasu', en:'Please', note:'Request phrase'},
      {ja:'Sayōnara', en:'Goodbye', note:'Formal farewell'},
    ],
    phrases:[
      {ja:'Watashi no namae wa…', en:'My name is…'},
      {ja:'Wakarimasen', en:'I do not understand'},
      {ja:'… wa doko desu ka?', en:'Where is…?'},
      {ja:'Ikura desu ka?', en:'How much is it?'},
      {ja:'Tasukete kudasai', en:'Please help me'},
    ],
    tip:'Tip: Japanese politeness matters. Start with “desu” and “masu” forms before casual speech.'
  },
  dutch: {
    name:'Dutch', flag:'🇳🇱', color:'#ea580c',
    intro:'Dutch is useful for the Netherlands, Belgium and international study. English speakers learn it faster because many words are related.',
    greetings:[
      {nl:'Hallo', en:'Hello', note:'Universal'},
      {nl:'Goedemorgen', en:'Good morning', note:''},
      {nl:'Goedemiddag', en:'Good afternoon', note:''},
      {nl:'Goedenavond', en:'Good evening', note:''},
      {nl:'Hoe gaat het?', en:'How are you?', note:''},
      {nl:'Het gaat goed', en:'I am fine', note:''},
      {nl:'Dank je', en:'Thank you', note:'Informal'},
      {nl:'Alstublieft', en:'Please / here you are', note:'Polite'},
      {nl:'Tot ziens', en:'Goodbye', note:''},
    ],
    phrases:[
      {nl:'Ik heet…', en:'My name is…'},
      {nl:'Ik begrijp het niet', en:'I do not understand'},
      {nl:'Waar is…?', en:'Where is…?'},
      {nl:'Hoeveel kost dit?', en:'How much does this cost?'},
      {nl:'Ik heb hulp nodig', en:'I need help'},
    ],
    tip:'Tip: Dutch “g” is throaty. It may feel unusual at first, but consistent listening makes it easier.'
  },
  german: {
    name:'German', flag:'🇩🇪', color:'#525252',
    intro:'Germany offers tuition-free university education to Ghanaian students who pass German exams (B1/B2). A practical pathway to studying in Europe.',
    greetings:[
      {de:'Hallo',            en:'Hello',                 note:'Universal'},
      {de:'Guten Morgen',     en:'Good morning',          note:''},
      {de:'Guten Tag',        en:'Good day',              note:'Daytime greeting'},
      {de:'Guten Abend',      en:'Good evening',          note:''},
      {de:'Wie geht es dir?', en:'How are you? (informal)',note:''},
      {de:'Mir geht es gut',  en:'I am well',             note:''},
      {de:'Danke schön',      en:'Thank you very much',   note:''},
      {de:'Bitte',            en:'Please / You\'re welcome',note:'Multi-use'},
      {de:'Auf Wiedersehen',  en:'Goodbye',               note:''},
    ],
    phrases:[
      {de:'Ich heiße…',       en:'My name is…'},
      {de:'Ich verstehe nicht',en:'I don\'t understand'},
      {de:'Wo ist…?',         en:'Where is…?'},
      {de:'Wie viel kostet das?',en:'How much does it cost?'},
      {de:'Ich brauche Hilfe',en:'I need help'},
    ],
    tip:'Tip: German nouns are always capitalised: das Buch (the book), der Mann (the man). It looks weird at first — embrace it.'
  }
};

function langOpen(key){
  const d = window.LT_LANGUAGES[key];
  if(!d) return;
  const container = document.getElementById('langContent');
  container.style.display = 'block';
  container.innerHTML = `
    <div style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:24px;padding:40px;backdrop-filter:blur(10px);">

      <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px;">
        <span style="font-size:2rem;">${d.flag}</span>
        <div>
          <h2 style="font-family:'Bricolage Grotesque',sans-serif;font-size:1.8rem;font-weight:900;margin:0;color:#fff;">${d.name}</h2>
          <div style="color:rgba(255,255,255,.6);font-size:.85rem;">Beginner module</div>
        </div>
      </div>

      <p style="color:rgba(255,255,255,.85);font-size:1rem;line-height:1.7;margin:0 0 30px;">${d.intro}</p>

      <h3 style="color:#fbbf24;font-family:'Bricolage Grotesque',sans-serif;font-size:1.1rem;font-weight:800;margin:0 0 16px;text-transform:uppercase;letter-spacing:.05em;">Greetings</h3>
      <div style="display:grid;gap:12px;margin-bottom:30px;">
        ${d.greetings.map(g=>`
          <div style="background:rgba(255,255,255,.04);border-left:3px solid ${d.color};padding:14px 18px;border-radius:0 12px 12px 0;">
            <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin-bottom:4px;flex-wrap:wrap;">
              <div style="font-size:1.05rem;font-weight:700;color:#fff;">${g.yor}</div>
              <div style="color:rgba(255,255,255,.7);font-size:.9rem;">${g.en}</div>
            </div>
            ${g.note?`<div style="color:rgba(255,255,255,.5);font-size:.75rem;font-style:italic;">${g.note}</div>`:''}
          </div>
        `).join('')}
      </div>

      <h3 style="color:#fbbf24;font-family:'Bricolage Grotesque',sans-serif;font-size:1.1rem;font-weight:800;margin:0 0 16px;text-transform:uppercase;letter-spacing:.05em;">Useful Phrases</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;margin-bottom:30px;">
        ${d.phrases.map(p=>`
          <div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);padding:16px;border-radius:12px;">
            <div style="font-size:1rem;font-weight:700;color:#fff;margin-bottom:4px;">${p.yor}</div>
            <div style="color:rgba(255,255,255,.65);font-size:.85rem;">${p.en}</div>
          </div>
        `).join('')}
      </div>

      <div style="background:linear-gradient(135deg,${d.color}22,${d.color}11);border:1px solid ${d.color}55;border-radius:16px;padding:18px 20px;color:#fff;font-size:.9rem;line-height:1.6;">
        💡 ${d.tip}
      </div>

      <button onclick="document.getElementById('langContent').style.display='none';window.scrollTo({top:0,behavior:'smooth'})" style="margin-top:24px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);color:#fff;padding:10px 22px;border-radius:100px;font-weight:700;font-size:.85rem;cursor:pointer;">← Back to language picker</button>
    </div>
  `;
  window.scrollTo({top:container.offsetTop-40,behavior:'smooth'});
}
