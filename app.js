/* Vocabularies practice — local-first vocabulary trainer */
(() => {
  "use strict";

  const DB_NAME = "remember-2027";
  const DB_VERSION = 1;
  const STORE_NAME = "app-state";
  const STATE_KEY = "current";
  const TARGET_DATE = new Date("2027-01-20T23:59:59+08:00").getTime();
  const FIRST_PASS_TARGET_DATE = new Date("2026-08-28T23:59:59+08:00").getTime();
  const DAY = 24 * 60 * 60 * 1000;
  const APP_STATE_VERSION = 11;
  const MASTERY_STAGE_SCORES = [0, 20, 40, 60, 80, 100];
  const app = document.getElementById("app");
  const modalRoot = document.getElementById("modal-root");
  const fileInput = document.getElementById("file-input");
  const restoreInput = document.getElementById("restore-input");

  let state;
  let dbPromise;
  let isSaving = false;

  const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  const now = () => Date.now();
  const escapeHtml = (value = "") => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
  const shuffle = (items) => {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }
    return copy;
  };
  const unique = (items) => [...new Set(items)];
  const dayLabel = (time) => new Intl.DateTimeFormat("zh-TW", { month: "numeric", day: "numeric" }).format(new Date(time));
  const dateTimeLabel = (time) => new Intl.DateTimeFormat("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(time));
  const daysUntilTarget = () => Math.max(0, Math.ceil((TARGET_DATE - now()) / DAY));
  const daysUntilFirstPass = () => Math.max(0, Math.ceil((FIRST_PASS_TARGET_DATE - now()) / DAY));
  const plusDays = (days) => now() + days * DAY;
  const initialGap = { A: 1, B: 1, C: 1 };
  const reviewIntervals = [1, 3, 7, 14, 30];

  function taipeiDayKey(time) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(new Date(time));
    const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }

  function entry(term, meaning, kind, anchor, pos = "") {
    return { id: uid(), term, meaning, kind, anchor, pos, initialDifficulty: null, initialLearning: null, mastery: null, createdAt: now() };
  }

  function buildUnitOneWords() {
    const rows = [
      ["adverse", "不利的；負面的；有害的", "主字", "adverse", "adj."],
      ["adversity", "逆境；厄運", "字族", "adverse", "n."],
      ["harmful", "有害的", "近義字", "adverse", "adj."],
      ["detrimental", "有害的；不利的", "近義字", "adverse", "adj."],
      ["unfavorable", "不利的；令人不快的；有害的", "近義字", "adverse", "adj."],
      ["verse", "詩", "形近字", "adverse", "n."],
      ["diverse", "不同的；互異的", "形近字", "adverse", "adj."],
      ["universe", "宇宙", "形近字", "adverse", "n."],
      ["adverse conditions", "不利條件", "搭配用法", "adverse"],

      ["affection", "愛慕；情感", "主字", "affection", "n."],
      ["affectionate", "關愛的；溫柔的；深情的", "字族", "affection", "adj."],
      ["fondness", "喜愛", "近義字", "affection", "n."],
      ["perfection", "完美", "形近字", "affection", "n."],
      ["confection", "蜜餞；糖果", "形近字", "affection", "n."],
      ["infection", "感染", "形近字", "affection", "n."],

      ["agony", "極度痛苦", "主字", "agony", "n."],
      ["agonize", "（使）痛苦", "字族", "agony", "v."],
      ["suffering", "受苦；折磨", "近義字", "agony", "n."],
      ["pain", "痛苦", "近義字", "agony", "n."],
      ["misery", "悲慘", "近義字", "agony", "n."],
      ["agon", "競賽；鬥爭", "形近字", "agony", "n."],

      ["annoy", "惹惱；使生氣", "主字", "annoy", "v."],
      ["annoying", "使人煩惱的；令人討厭的", "字族", "annoy", "adj."],
      ["annoyance", "使人煩惱的事；惱怒", "字族", "annoy", "n."],
      ["irritate", "使煩惱；使惱怒", "近義字", "annoy", "v."],
      ["upset", "使生氣", "近義字", "annoy", "v."],
      ["bother", "煩擾", "近義字", "annoy", "v."],
      ["disturb", "妨礙；打擾", "近義字", "annoy", "v."],
      ["annual", "一年一度的", "形近字", "annoy", "adj."],
      ["be annoyed with / at someone", "對某人生氣、感到煩惱", "搭配用法", "annoy"],

      ["appreciation", "感激；賞識；理解", "主字", "appreciation", "n."],
      ["appreciate", "感激；賞識；理解", "字族", "appreciation", "v."],
      ["appreciative", "有鑑賞力的；能確認價值的；感激的", "字族", "appreciation", "adj."],
      ["gratitude", "感激", "近義字", "appreciation", "n."],
      ["awareness", "理解", "近義字", "appreciation", "n."],
      ["show / express one's appreciation for something", "對某事表示感激", "搭配用法", "appreciation"],

      ["awe", "敬畏；驚嘆", "主字", "awe", "n. / v."],
      ["awesome", "很困難的；令人驚嘆的", "字族", "awe", "adj."],
      ["reverence", "敬畏", "近義字", "awe", "n."],
      ["astonishment", "驚愕", "近義字", "awe", "n."],
      ["awkward", "笨拙的；不靈巧的；難處理的", "形近字", "awe", "adj."],
      ["in / with awe", "敬畏地", "搭配用法", "awe"],

      ["bear", "承受；忍耐", "主字", "bear", "v."],
      ["tolerate", "容忍", "近義字", "bear", "v."],
      ["endure", "忍受", "近義字", "bear", "v."],
      ["stand", "忍受", "近義字", "bear", "v."],
      ["put up with", "忍受", "近義字", "bear", "v."],
      ["rear", "養育；培養；後面的", "形近字", "bear", "v. / adj."],
      ["gear", "齒輪；（汽車的）排檔", "形近字", "bear", "n."],
      ["bare", "裸的；光禿禿的", "形近字", "bear", "adj."],
      ["bear up", "挺住；保持振作", "搭配用法", "bear"],

      ["complain", "抱怨；發牢騷", "主字", "complain", "v."],
      ["complaint", "抱怨", "字族", "complain", "n."],
      ["whine", "嘮叨；發牢騷", "近義字", "complain", "v."],
      ["grumble", "抱怨；發牢騷", "近義字", "complain", "v."],
      ["plain", "簡樸的；平易的", "形近字", "complain", "adj."],
      ["explain", "解釋", "形近字", "complain", "v."],
      ["complacent", "自滿的", "形近字", "complain", "adj."],
      ["compliant", "順從的", "形近字", "complain", "adj."],
      ["make a complaint", "投訴；抱怨", "搭配用法", "complain"],

      ["contempt", "輕視；蔑視", "主字", "contempt", "n."],
      ["contemptuous", "表示輕蔑的；瞧不起的", "字族", "contempt", "adj."],
      ["scorn", "輕蔑；鄙視", "近義字", "contempt", "n. / v."],
      ["disdain", "輕蔑；蔑視；鄙棄", "近義字", "contempt", "n. / v."],
      ["disrespect", "不敬；蔑視", "近義字", "contempt", "v."],
      ["contemplate", "思忖；沉思；考慮", "形近字", "contempt", "v."],
      ["contemporary", "當代的；同時代的；同時代的人", "形近字", "contempt", "adj. / n."],
      ["tempt", "引誘；誘惑", "形近字", "contempt", "v."],
      ["hold someone / something in contempt", "對某人／某事不屑一顧", "搭配用法", "contempt"],

      ["dejected", "沮喪的；情緒低落的", "主字", "dejected", "adj."],
      ["dejection", "沮喪；灰心；挫折", "字族", "dejected", "n."],
      ["depressed", "沮喪的", "近義字", "dejected", "adj."],
      ["miserable", "悲慘的", "近義字", "dejected", "adj."],
      ["eject", "逐出；噴射", "形近字", "dejected", "v."],
      ["inject", "注射（藥液）", "形近字", "dejected", "v."],
      ["project", "方案；計畫；工程；計劃；突出", "形近字", "dejected", "n. / v."],
      ["reject", "拒絕", "形近字", "dejected", "v."],

      ["deliberate", "故意的；深思熟慮的；謹慎的；仔細考慮；思考", "主字", "deliberate", "adj. / v."],
      ["deliberation", "深思熟慮；考慮", "字族", "deliberate", "n."],
      ["intentional", "故意的", "近義字", "deliberate", "adj."],
      ["conscious", "有意識的", "近義字", "deliberate", "adj."],
      ["willful", "故意的；倔強的", "近義字", "deliberate", "adj."],
      ["elaborate", "精巧的；詳盡的；詳述；精心製作", "形近字", "deliberate", "adj. / v."],
      ["considerate", "體貼的；體諒的；考慮周到的", "形近字", "deliberate", "adj."],
      ["liberate", "解放；使獲自由", "形近字", "deliberate", "v."],

      ["depression", "沮喪；情緒低落；憂鬱症；蕭條", "主字", "depression", "n."],
      ["low spirits", "情緒低落", "近義字", "depression", "n."],
      ["melancholy", "憂鬱；愁思；憂鬱的", "近義字", "depression", "n. / adj."],
      ["compression", "壓縮；壓搾", "形近字", "depression", "n."],
      ["expression", "表達；表示；表情；措辭", "形近字", "depression", "n."],
      ["impression", "印象", "形近字", "depression", "n."],
      ["oppression", "壓迫；壓制", "形近字", "depression", "n."],
      ["economic depression", "經濟蕭條", "搭配用法", "depression"],

      ["despair", "絕望", "主字", "despair", "n. / v."],
      ["desperate", "非常渴望的；情急的；（因絕望而）拼命的", "字族", "despair", "adj."],
      ["desperation", "絕望；不顧一切", "字族", "despair", "n."],
      ["lose heart", "喪失信心", "近義字", "despair", "v."],
      ["desperado", "亡命之徒", "形近字", "despair", "n."],
      ["be in despair about / over something", "對某事絕望", "搭配用法", "despair"],
      ["despair of", "對……絕望／喪失信心", "搭配用法", "despair"],

      ["disgust", "使作嘔；使厭惡；厭惡", "主字", "disgust", "v. / n."],
      ["disgusting", "令人噁心的；令人厭惡的", "字族", "disgust", "adj."],
      ["disgusted", "反感的；感到厭惡的", "字族", "disgust", "adj."],
      ["nausea", "噁心；作嘔；暈船", "近義字", "disgust", "n."],
      ["disguise", "偽裝；偽裝物", "形近字", "disgust", "v. / n."],
      ["gust", "一陣強風；爆發", "形近字", "disgust", "n."],
      ["gusto", "熱情；熱忱", "形近字", "disgust", "n."],
      ["to someone's disgust", "讓某人感到厭惡的是……", "搭配用法", "disgust"],

      ["dubious", "半信半疑的；懷疑的；猶豫不決的", "主字", "dubious", "adj."],
      ["suspicious", "猜疑的", "近義字", "dubious", "adj."],
      ["hesitant", "猶豫的", "近義字", "dubious", "adj."],
      ["doubtful", "懷疑的", "近義字", "dubious", "adj."],
      ["dub", "給……取綽號", "形近字", "dubious", "v."]
    ];
    return rows.map(([term, meaning, kind, anchor, pos]) => entry(term, meaning, kind, anchor, pos));
  }

  function buildUnitTwoWords() {
    const rows = [
      ["eager", "渴望的；熱切的", "主字", "eager"],
      ["eagerness", "渴望", "字族", "eager"],
      ["anxious", "渴望的；焦慮的", "近義字", "eager"],
      ["longing", "渴望；渴望的", "近義字", "eager"],
      ["enthusiastic", "熱烈的", "近義字", "eager"],
      ["passionate", "熱情的", "近義字", "eager"],
      ["eager for / eager to do something", "渴望（做）某事", "搭配用法", "eager"],

      ["ecstasy", "狂喜；出神；入迷", "主字", "ecstasy"],
      ["ecstatic", "狂喜的", "字族", "ecstasy"],
      ["rapture", "著迷；狂喜", "近義字", "ecstasy"],
      ["bliss", "極樂；至喜", "近義字", "ecstasy"],
      ["in (an) ecstasy", "狂喜", "搭配用法", "ecstasy"],
      ["go into ecstasies over / about something", "陶醉於……", "搭配用法", "ecstasy"],

      ["emotional", "感情上的；情感的；激動的；激動人心的", "主字", "emotional"],
      ["emotion", "感情；情感", "字族", "emotional"],
      ["sensitive", "敏感的；脆弱的", "近義字", "emotional"],
      ["sentimental", "感傷的；多愁善感的", "近義字", "emotional"],
      ["motion", "運動；移動；動作", "形近字", "emotional"],
      ["promotion", "促銷；升級；升遷", "形近字", "emotional"],
      ["demotion", "降級", "形近字", "emotional"],
      ["emoticon", "表情符號", "形近字", "emotional"],
      ["emotional support", "情感的支持；精神支持", "搭配用法", "emotional"],

      ["endorse", "贊成；認可；支持；吹捧；背書", "主字", "endorse"],
      ["endorsement", "支持；認可；名人代言", "字族", "endorse"],
      ["support", "支持；贊成；擁護", "近義字", "endorse"],
      ["approve", "贊同；稱許", "近義字", "endorse"],
      ["confirm", "確認；確定；肯定", "近義字", "endorse"],
      ["endow", "捐獻；捐贈；資助", "形近字", "endorse"],
      ["endorse an idea / a candidate", "贊成某個點子／某個候選人", "搭配用法", "endorse"],

      ["envious", "羨慕的；嫉妒的", "主字", "envious"],
      ["envy", "羨慕；嫉妒", "字族", "envious"],
      ["jealous", "嫉妒的；吃醋的", "近義字", "envious"],
      ["green with envy", "非常嫉妒；眼紅", "近義字", "envious"],
      ["devious", "迂迴的；不坦率的", "形近字", "envious"],
      ["impervious", "不能穿透的；不能滲透的", "形近字", "envious"],
      ["oblivious", "未注意的；忘卻的；健忘的", "形近字", "envious"],
      ["obvious", "明顯的", "形近字", "envious"],
      ["previous", "先前的；以前的", "形近字", "envious"],

      ["flexible", "有彈性的；靈活的；柔韌的；可彎曲的", "主字", "flexible"],
      ["flexibility", "彈性；靈活性", "字族", "flexible"],
      ["elastic", "有彈性的；靈活的；能恢復的", "近義字", "flexible"],
      ["plastic", "可塑的；塑膠的；塑膠", "近義字", "flexible"],
      ["supple", "易彎曲的；柔軟的；順從的", "近義字", "flexible"],
      ["adjustable", "可調整的", "近義字", "flexible"],
      ["reflexible", "可反射的", "形近字", "flexible"],
      ["flexible working hours", "彈性工時", "搭配用法", "flexible"],

      ["frantic", "（因喜悅、憤怒等）發狂似的；慌亂的；狂亂的", "主字", "frantic"],
      ["wild", "狂怒的；瘋狂的", "近義字", "frantic"],
      ["panicky", "驚恐的；驚慌失措的", "近義字", "frantic"],
      ["agitated", "激動的", "近義字", "frantic"],
      ["fantastic", "了不起的", "形近字", "frantic"],
      ["fanatic", "入迷者；狂熱信徒；入迷的；狂熱的", "形近字", "frantic"],
      ["be frantic with something", "因……而發狂似的", "搭配用法", "frantic"],

      ["furious", "狂怒的；狂暴的", "主字", "furious"],
      ["fury", "憤怒；暴怒", "字族", "furious"],
      ["angry", "生氣的", "近義字", "furious"],
      ["outraged", "狂怒的；憤怒的", "近義字", "furious"],
      ["fur", "毛皮；毛皮製品", "形近字", "furious"],
      ["be furious at", "對……大發雷霆", "搭配用法", "furious"],
      ["be in a fury", "大發雷霆", "搭配用法", "furious"],

      ["fuss", "大驚小怪；忙亂；大驚小怪；過分體貼關心", "主字", "fuss"],
      ["fussy", "挑剔的；難以取悅的", "字族", "fuss"],
      ["agitation", "騷動", "近義字", "fuss"],
      ["confusion", "混亂；騷動", "近義字", "fuss"],
      ["storm in a teacup", "大驚小怪；小題大作", "近義字", "fuss"],
      ["fuse", "保險絲", "形近字", "fuss"],
      ["fuzzy", "有絨毛的；模糊不清的", "形近字", "fuss"],
      ["make a fuss about / over something", "對某事大驚小怪", "搭配用法", "fuss"],

      ["gentle", "溫和的；仁慈的；高貴的；有教養的", "主字", "gentle"],
      ["mellow", "溫和的", "近義字", "gentle"],
      ["tender", "溫柔的；體貼的", "近義字", "gentle"],
      ["mild", "溫和的", "近義字", "gentle"],
      ["gentleman", "紳士；男士", "形近字", "gentle"],
      ["gentility", "出身高貴；上流社會", "形近字", "gentle"],

      ["goodwill", "善意；友善", "主字", "goodwill"],
      ["sincerity", "誠實；真誠", "近義字", "goodwill"],
      ["sympathy", "同情；憐憫", "近義字", "goodwill"],
      ["affection", "愛慕；情感", "近義字", "goodwill"],
      ["will", "決心；意志；心願；遺囑", "形近字", "goodwill"],
      ["the season of goodwill", "聖誕節前後", "搭配用法", "goodwill"],

      ["grateful", "感謝的；感激的", "主字", "grateful"],
      ["gratitude", "感激之情；感謝", "字族", "grateful"],
      ["thankful", "感謝的；感激的", "近義字", "grateful"],
      ["obliged", "感激的", "近義字", "grateful"],
      ["appreciative", "感謝的；感激的；有欣賞力的", "近義字", "grateful"],
      ["ungrateful", "忘恩負義的", "形近字", "grateful"],
      ["hateful", "可恨的；可憎的", "形近字", "grateful"],
      ["grateful to someone (for something)", "對某人（為某事）表示感激", "搭配用法", "grateful"],

      ["grief", "悲痛；悲傷", "主字", "grief"],
      ["grieve", "（使）悲傷；（使）傷痛", "字族", "grief"],
      ["anguish", "痛苦；悲痛", "近義字", "grief"],
      ["remorse", "悔恨；懊悔", "近義字", "grief"],
      ["misery", "悲慘；不幸", "近義字", "grief"],
      ["brief", "短暫的", "形近字", "grief"],
      ["come to grief", "遭遇失敗（或毀滅）", "搭配用法", "grief"],

      ["hatred", "憎恨；敵意", "主字", "hatred"],
      ["dislike", "厭惡", "近義字", "hatred"],
      ["hostility", "敵意", "近義字", "hatred"],
      ["antipathy", "反感", "近義字", "hatred"],
      ["sacred", "神聖的", "形近字", "hatred"],
      ["hatred for someone / something", "對某人／某事懷有仇恨", "搭配用法", "hatred"],

      ["impulse", "衝動；一時的念頭", "主字", "impulse"],
      ["impulsive", "衝動的", "字族", "impulse"],
      ["stimulation", "刺激；興奮；激勵", "近義字", "impulse"],
      ["urge", "慾望；衝動；敦促；催促；極力主張", "近義字", "impulse"],
      ["argument", "爭吵；爭論；指言語上的激烈爭辯", "字義辨析", "stimulation"],
      ["fight", "爭吵；指言語上的激烈爭吵或肢體衝突", "字義辨析", "stimulation"],
      ["quarrel", "爭吵；不和；指口頭上的爭吵", "字義辨析", "stimulation"],
      ["pulse", "脈搏", "形近字", "impulse"],
      ["impasse", "死路；僵局", "形近字", "impulse"],
      ["impose", "徵稅；把……強加於", "形近字", "impulse"],

      ["inclined", "傾向於……；易於……的", "主字", "inclined"],
      ["incline", "（使）傾向於……；（使）傾斜", "字族", "inclined"],
      ["inclination", "傾向；意向；愛好", "字族", "inclined"],
      ["tend", "往往會；傾向；照料", "近義字", "inclined"],
      ["have a preference for", "對……有偏愛", "近義字", "inclined"],
      ["decline", "下降；下跌；減少；婉拒；減少；衰退", "形近字", "inclined"],
      ["outline", "外形；輪廓；畫……的輪廓", "形近字", "inclined"],
      ["underline", "在……下面畫線；強調", "形近字", "inclined"],
      ["be inclined to", "傾向於……", "搭配用法", "inclined"],

      ["incur", "招致；遭受", "主字", "incur"],
      ["arouse", "引起；喚起；激起", "近義字", "incur"],
      ["provoke", "激起；引起", "近義字", "incur"],
      ["induce", "導致；誘使；勸說", "近義字", "incur"],
      ["currency", "通貨；貨幣；流通；傳播", "形近字", "incur"],
      ["curriculum", "學校的全部課程", "形近字", "incur"],
      ["excursion", "遠足；短途旅行", "形近字", "incur"]
    ];
    return rows.map(([term, meaning, kind, anchor]) => entry(term, meaning, kind, anchor));
  }

  function buildUnitThreeWords() {
    const rows = [
      ["panic", "恐慌；驚慌", "主字", "panic"],
      ["panicky", "驚恐的；恐慌的", "字族", "panic"],
      ["fright", "驚嚇", "近義字", "panic"],
      ["hysteria", "歇斯底里", "近義字", "panic"],
      ["terror", "驚駭", "近義字", "panic"],
      ["pain", "痛苦", "形近字", "panic"],
      ["pan", "平底鍋", "形近字", "panic"],
      ["panacea", "萬靈丹", "形近字", "panic"],
      ["penalty", "處罰；罰球；罰款", "形近字", "panic"],
      ["get into a panic", "驚慌", "搭配用法", "panic"],

      ["passive", "被動的；消極的；順從的", "主字", "passive"],
      ["compliant", "順從的", "近義字", "passive"],
      ["docile", "易駕馭的；好教的", "近義字", "passive"],
      ["inactive", "不活躍的", "近義字", "passive"],
      ["passing", "短暫的", "形近字", "passive"],
      ["massive", "大而重的；大規模的", "形近字", "passive"],
      ["passive smoking", "二手菸", "搭配用法", "passive"],

      ["prejudice", "偏見；歧視", "主字", "prejudice"],
      ["bias", "成見；偏見", "近義字", "prejudice"],
      ["discrimination", "歧視；區別", "近義字", "prejudice"],
      ["judicious", "有見識的；明智的", "形近字", "prejudice"],
      ["prejudgment", "預先判斷", "形近字", "prejudice"],
      ["have a prejudice against someone", "對某人抱持偏見", "搭配用法", "prejudice"],

      ["pressure", "壓力", "主字", "pressure"],
      ["press", "壓；按；媒體；新聞界", "字族", "pressure"],
      ["stress", "壓力；著重；強調", "近義字", "pressure"],
      ["burden", "負擔；負荷", "近義字", "pressure"],
      ["load", "負荷；工作量；裝載；裝載", "近義字", "pressure"],
      ["treasure", "金銀財寶；財富；貴重物品；珍惜", "形近字", "pressure"],
      ["measure", "尺寸；測量；措施；方法", "形近字", "pressure"],
      ["under pressure", "受到很大的壓力", "搭配用法", "pressure"],

      ["provoke", "挑釁；激怒；激起", "主字", "provoke"],
      ["provocative", "挑釁的；引誘的", "字族", "provoke"],
      ["cause", "導致；引起；原因；事業；目標", "近義字", "provoke"],
      ["incite", "激起；煽動", "近義字", "provoke"],
      ["bring about", "導致", "近義字", "provoke"],
      ["evoke", "喚起（記憶）", "形近字", "provoke"],
      ["invoke", "祈求（神等）；庇護；喚起", "形近字", "provoke"],
      ["revoke", "撤回；撤銷；廢除", "形近字", "provoke"],
      ["thought-provoking", "令人深思的", "搭配用法", "provoke"],

      ["quarrel", "爭吵；不和", "主字", "quarrel"],
      ["quarrelsome", "喜歡爭吵的", "字族", "quarrel"],
      ["argument", "爭吵；辯論；論點", "近義字", "quarrel"],
      ["fight", "打鬥；爭吵；鬥爭", "近義字", "quarrel"],
      ["disagreement", "爭吵；爭論", "近義字", "quarrel"],
      ["feud", "世仇；長期不和", "近義字", "quarrel"],
      ["dissent", "不同意；異議", "近義字", "quarrel"],
      ["querulous", "愛發牢騷的", "形近字", "quarrel"],
      ["barrel", "桶", "形近字", "quarrel"],
      ["pick a quarrel with someone", "故意和某人爭吵；尋釁", "搭配用法", "quarrel"],

      ["refuse", "拒絕", "主字", "refuse"],
      ["refusal", "拒絕", "字族", "refuse"],
      ["reject", "拒絕；抵制；駁回", "近義字", "refuse"],
      ["decline", "下降；下跌；減少；婉拒", "近義字", "refuse"],
      ["fuse", "保險絲", "形近字", "refuse"],
      ["infuse", "注入；灌輸", "形近字", "refuse"],
      ["confuse", "使困惑；搞混", "形近字", "refuse"],
      ["transfuse", "輸血", "形近字", "refuse"],
      ["too good to refuse", "難以抗拒", "搭配用法", "refuse"],

      ["regret", "悔恨；因……而遺憾；為……抱歉；悔恨；遺憾", "主字", "regret"],
      ["regretful", "懊悔的；遺憾的", "字族", "regret"],
      ["feel sorry about something", "對某事感到遺憾", "近義字", "regret"],
      ["regret doing something", "懊悔做了某件事", "搭配用法", "regret"],
      ["regret to tell / inform someone that", "很遺憾地告知某人某事", "搭配用法", "regret"],

      ["relief", "緩和；減輕；輕鬆；寬心", "主字", "relief"],
      ["relieve", "緩和；減輕；解除", "字族", "relief"],
      ["alleviation", "減輕；緩解", "近義字", "relief"],
      ["ease", "放鬆；緩和；使覺得；減輕；緩和", "近義字", "relief"],
      ["leaf", "葉子；（書的）一頁", "形近字", "relief"],
      ["relive", "（憑回憶或想像）再體驗；再經歷；復活", "形近字", "relief"],

      ["repent", "後悔；懺悔；悔改", "主字", "repent"],
      ["repentant", "後悔的", "字族", "repent"],
      ["repentance", "後悔；懺悔；悔改", "字族", "repent"],
      ["regret", "悔恨；因……而遺憾；悔恨", "近義字", "repent"],
      ["be conscience-stricken", "內疚的；良心不安的", "近義字", "repent"],
      ["penitent", "悔過的；懺悔的", "形近字", "repent"],
      ["penalty", "懲罰；罰球；罰款", "形近字", "repent"],
      ["repeat", "重複", "形近字", "repent"],

      ["resent", "憤概；怨恨", "主字", "resent"],
      ["resentment", "憤概；怨恨；不滿", "字族", "resent"],
      ["dislike", "厭惡", "近義字", "resent"],
      ["be annoyed at", "對……感到惱怒", "近義字", "resent"],
      ["consent", "同意；贊成", "形近字", "resent"],
      ["assent", "同意；贊成", "形近字", "resent"],
      ["sentimental", "感傷的；感情上的；感情用事的", "形近字", "resent"],

      ["resist", "抵抗；抗拒；反抗", "主字", "resist"],
      ["resistance", "抵抗（力）；反抗", "字族", "resist"],
      ["withstand", "抵擋；反抗", "近義字", "resist"],
      ["prevent", "防止；預防", "近義字", "resist"],
      ["assist", "幫助；協助", "形近字", "resist"],
      ["consist", "組成；構成", "形近字", "resist"],
      ["insist", "堅持", "形近字", "resist"],
      ["persist", "堅持", "形近字", "resist"],
      ["resist doing something", "抗拒做某事", "搭配用法", "resist"],

      ["sentimental", "感情用事的；感情上的；感傷的", "主字", "sentimental"],
      ["sentiment", "感情；情緒；觀點；意見", "字族", "sentimental"],
      ["emotional", "情感的；激動人心的；激動的", "近義字", "sentimental"],
      ["mental", "精神的；心理的", "形近字", "sentimental"],
      ["elemental", "基本的；原始的", "形近字", "sentimental"],
      ["fundamental", "基礎的；十分重要的；基本原則", "形近字", "sentimental"],
      ["detrimental", "有害的", "形近字", "sentimental"],
      ["mentor", "良師益友", "形近字", "sentimental"],

      ["solitude", "孤寂；隱居", "主字", "solitude"],
      ["solitary", "單獨的；獨自的", "字族", "solitude"],
      ["isolation", "隔離；孤立", "近義字", "solitude"],
      ["seclusion", "隔絕；孤立；隱居", "近義字", "solitude"],
      ["altitude", "高度；海拔", "形近字", "solitude"],
      ["aptitude", "傾向；習性；天資", "形近字", "solitude"],
      ["attitude", "態度", "形近字", "solitude"],
      ["certitude", "確定；確信", "形近字", "solitude"],
      ["gratitude", "感激", "形近字", "solitude"],
      ["in solitude", "孤寂", "搭配用法", "solitude"],

      ["stimulate", "刺激；興奮；激勵", "主字", "stimulate"],
      ["stimulation", "刺激；興奮；激勵", "字族", "stimulate"],
      ["encourage", "鼓勵；慫恿；促進", "近義字", "stimulate"],
      ["excite", "刺激；使興奮", "近義字", "stimulate"],
      ["spur", "鞭策；鼓勵；激勵因素；鼓舞", "近義字", "stimulate"],
      ["simulate", "假裝；模仿", "形近字", "stimulate"],
      ["accumulate", "累積", "形近字", "stimulate"],
      ["stimulate someone to do something", "激勵某人去做某事", "搭配用法", "stimulate"],
      ["argument", "爭吵；爭論；指言語上的激烈爭辯", "字義辨析", "stimulation"],
      ["fight", "爭吵；指言語上的激烈爭吵或肢體衝突", "字義辨析", "stimulation"],
      ["quarrel", "爭吵；不和；指口頭上的爭吵", "字義辨析", "stimulation"]
    ];
    return rows.map(([term, meaning, kind, anchor]) => entry(term, meaning, kind, anchor));
  }

  function defaultState() {
    const book = { id: "ios-default-book", name: "進階英單" };
    const unit = {
      bookId: book.id,
      id: uid(),
      name: "Unit 1 · 情緒與感覺（1）",
      createdAt: now(),
      note: "主字、字族、近義字、形近字與搭配用法",
      source: "課本照片"
    };
    const words = buildUnitOneWords().map((word) => ({ ...word, unitId: unit.id }));
    return {
      version: APP_STATE_VERSION,
      books: [book],
      units: [unit],
      words,
      studyGroups: makeStudyGroups(unit.id, words.map((word) => word.id)),
      tests: [],
      learningSessions: [],
      relearningSessions: [],
      pausedSessions: [],
      activeSession: null,
      lastCompletion: null,
      ui: { view: "home", selectedBookId: book.id, selectedUnitId: unit.id, tab: "overview" },
      createdAt: now(),
      updatedAt: now()
    };
  }

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return dbPromise;
  }

  async function readStoredState() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(STATE_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async function storeState(nextState) {
    nextState.updatedAt = now();
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(nextState, STATE_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("資料庫儲存失敗"));
      transaction.onabort = () => reject(transaction.error || new Error("資料庫儲存已中止"));
    });
  }

  async function commit(mutator) {
    if (isSaving) return;
    const previousState = structuredClone(state);
    isSaving = true;
    try {
      mutator(state);
      await storeState(state);
      render();
    } catch (error) {
      state = previousState;
      render();
      window.alert("這次操作尚未成功儲存，已保留原本進度。請確認瀏覽器允許網站儲存資料後再試一次。");
      console.error(error);
    } finally {
      isSaving = false;
    }
  }

  const getUnit = (unitId) => state.units.find((unit) => unit.id === unitId);
  const getBook = (bookId) => (state.books || []).find((book) => book.id === bookId);
  function currentBookId() {
    const selectedUnit = getUnit(state.ui?.selectedUnitId);
    return state.ui?.selectedBookId || selectedUnit?.bookId || state.books?.[0]?.id || null;
  }
  function currentBookUnits() {
    const bookId = currentBookId();
    return state.units.filter((unit) => (unit.bookId || state.books?.[0]?.id) === bookId);
  }
  const unitWords = (unitId) => state.words.filter((word) => word.unitId === unitId);
  const findWord = (wordId) => state.words.find((word) => word.id === wordId);
  const learnedWords = (unitId) => unitWords(unitId).filter((word) => word.initialDifficulty);
  const remainingWords = (unitId) => unitWords(unitId).filter((word) => !word.initialDifficulty);
  const difficultyCounts = (words) => ({
    A: words.filter((word) => word.initialDifficulty === "A").length,
    B: words.filter((word) => word.initialDifficulty === "B").length,
    C: words.filter((word) => word.initialDifficulty === "C").length
  });

  function masteryStage(word) {
    if (!word?.initialDifficulty) return 0;
    const savedStage = Number(word.mastery?.stage);
    if (Number.isInteger(savedStage) && savedStage >= 1 && savedStage <= 5) return savedStage;

    // v9 and older states used a mix of `status` and `evidenceCount`.  This
    // fallback is read-only; v10 migration writes the canonical stage value.
    const status = word.mastery?.status;
    if (status === "穩定") return 5;
    if (status === "熟悉") return 4;
    if (status === "學習中") return (word.mastery?.evidenceCount || 0) >= 2 ? 3 : 2;
    return 1;
  }

  function masteryScore(word) {
    return MASTERY_STAGE_SCORES[masteryStage(word)] || 0;
  }

  function masteryStageLabel(word) {
    if (!word?.initialDifficulty) return "尚未初學";
    if (word.mastery?.needsRecovery) return "需加強";
    const stage = masteryStage(word);
    if (stage === 1) return "已初學";
    if (stage <= 3) return "學習中";
    if (stage === 4) return "熟悉";
    return "穩定";
  }

  function masteryVisualBucket(word) {
    if (!word?.initialDifficulty) return "unlearned";
    if (word.mastery?.needsRecovery) return "strengthen";
    const stage = masteryStage(word);
    if (stage === 1) return "initial";
    if (stage <= 3) return "learning";
    if (stage === 4) return "familiar";
    return "stable";
  }

  function masteryDistribution(words) {
    const keys = ["unlearned", "initial", "strengthen", "learning", "familiar", "stable"];
    return Object.fromEntries(keys.map((key) => [key, words.filter((word) => masteryVisualBucket(word) === key).length]));
  }

  function unitMasterySummary(unit) {
    const words = unitWords(unit.id);
    const total = words.length;
    const complete = words.filter((word) => word.initialDifficulty).length;
    const stable = words.filter((word) => masteryStage(word) === 5).length;
    const due = words.filter((word) => word.initialDifficulty && word.mastery?.nextDueAt && word.mastery.nextDueAt <= now()).length;
    const mastery = total ? Math.round(words.reduce((sum, word) => sum + masteryScore(word), 0) / total) : 0;
    return { total, complete, stable, due, mastery, distribution: masteryDistribution(words) };
  }

  function groupWordIds(group) {
    return unique((group?.wordIds || []).filter(Boolean));
  }

  function createStudyGroup(unitId, wordIds, groupNumber, createdAt = now()) {
    return {
      id: uid(),
      unitId,
      groupNumber,
      wordIds: groupWordIds({ wordIds }),
      createdAt
    };
  }

  function makeStudyGroups(unitId, wordIds, startingNumber = 1) {
    const shuffled = shuffle(unique(wordIds).filter(Boolean));
    const groups = [];
    for (let index = 0; index < shuffled.length; index += 20) {
      groups.push(createStudyGroup(unitId, shuffled.slice(index, index + 20), startingNumber + groups.length));
    }
    return groups;
  }

  function storedSessionWordIds(session) {
    if (!session) return [];
    const saved = session.wordIds?.length
      ? session.wordIds
      : session.batchWordIds?.length
        ? session.batchWordIds
        : [...(session.queue || []), ...(session.responses || []).map((response) => response.wordId)];
    return unique(saved.filter(Boolean));
  }

  function sameWordSet(left, right) {
    const leftIds = unique(left || []);
    const rightIds = unique(right || []);
    if (leftIds.length !== rightIds.length) return false;
    const rightSet = new Set(rightIds);
    return leftIds.every((wordId) => rightSet.has(wordId));
  }

  function groupsForUnit(unitId) {
    return (state.studyGroups || [])
      .filter((group) => group.unitId === unitId)
      .sort((left, right) => (left.groupNumber || 0) - (right.groupNumber || 0));
  }

  function getStudyGroup(groupId) {
    return (state.studyGroups || []).find((group) => group.id === groupId);
  }

  function studyGroupWords(group) {
    return groupWordIds(group).map(findWord).filter(Boolean);
  }

  function studyGroupLabel(group) {
    return `第 ${group?.groupNumber || "—"} 組`;
  }

  function findStudyGroupByWordIds(groups, unitId, wordIds) {
    const sourceIds = unique(wordIds || []);
    if (!sourceIds.length) return null;
    return (groups || []).find((group) => group.unitId === unitId && sameWordSet(groupWordIds(group), sourceIds)) || null;
  }

  function groupTestRecords(groupId) {
    return state.tests.filter((record) => record.groupId === groupId);
  }

  function sessionBelongsToGroup(session, group) {
    if (!session || !group) return false;
    if (session.groupId) return session.groupId === group.id;
    return session.unitId === group.unitId && sameWordSet(storedSessionWordIds(session), groupWordIds(group));
  }

  function pausedSessionForGroup(group) {
    return (state.pausedSessions || []).find((session) => sessionBelongsToGroup(session, group)) || null;
  }

  function pauseActiveSession() {
    const session = state.activeSession;
    if (!session) return null;
    state.pausedSessions ||= [];
    const index = state.pausedSessions.findIndex((item) => item.id === session.id);
    if (index >= 0) state.pausedSessions[index] = structuredClone(session);
    else state.pausedSessions.push(structuredClone(session));
    state.activeSession = null;
    return session;
  }

  function resumePausedSession(sessionId) {
    const sessions = state.pausedSessions || [];
    const index = sessions.findIndex((session) => session.id === sessionId);
    if (index < 0) return false;
    if (state.activeSession?.id === sessionId) return true;
    if (state.activeSession) pauseActiveSession();
    const [session] = sessions.splice(index, 1);
    state.activeSession = session;
    state.ui = { ...state.ui, view: isLearningSession(session) ? "learning" : "test", selectedUnitId: session.unitId };
    return true;
  }

  function completedLearningSessionForGroup(group) {
    if (!group) return null;
    return state.learningSessions.find((session) => session.completedAt && (
      session.groupId === group.id
      || (session.unitId === group.unitId && sameWordSet(wordIdsForLearningSession(session), groupWordIds(group)))
    )) || null;
  }

  function groupTestSummary(group) {
    const record = groupTestRecords(group.id)[0];
    if (!record) return "尚未 Test";
    const convergence = testConvergenceSummary(record);
    const total = testSessionWordIds(record).length;
    const firstRound = total ? `首輪 ${convergence.firstKnown} / ${total}` : "已完成 Test";
    return convergence.converged && convergence.roundCount > 1
      ? `${firstRound} · 第 ${convergence.roundCount} 輪收斂`
      : firstRound;
  }

  function studyGroupProgress(group) {
    const words = studyGroupWords(group);
    const complete = words.filter((word) => word.initialDifficulty).length;
    return {
      words,
      total: words.length,
      complete,
      remaining: words.length - complete,
      counts: difficultyCounts(words),
      tests: groupTestRecords(group.id),
      active: sessionBelongsToGroup(state.activeSession, group),
      paused: pausedSessionForGroup(group)
    };
  }

  function dueWords() {
    const unitIds = new Set(currentBookUnits().map((unit) => unit.id));
    return state.words.filter((word) => unitIds.has(word.unitId) && word.initialDifficulty && word.mastery?.nextDueAt && word.mastery.nextDueAt <= now());
  }

  function masteryLabel(word) {
    return masteryStageLabel(word);
  }

  function currentBatchWordIds(session) {
    if (!session) return [];
    if (Array.isArray(session.batchWordIds) && session.batchWordIds.length) return unique(session.batchWordIds).filter(findWord);
    return unique([...(session.queue || []), ...(session.responses || []).map((response) => response.wordId)]).filter(findWord);
  }

  // A Test keeps its original 20-word set even after later rounds shrink to
  // only the words that were missed.  Older saved sessions did not have a
  // dedicated wordIds field, so retain a safe fallback for them as well.
  function testSessionWordIds(session) {
    if (!session) return [];
    const savedWordIds = session.wordIds?.length ? session.wordIds : session.batchWordIds;
    return unique(savedWordIds?.length ? savedWordIds : [
      ...(session.queue || []),
      ...(session.responses || []).map((response) => response.wordId)
    ]).filter(findWord);
  }

  function testResponseRound(response) {
    return Number.isInteger(response?.round) && response.round > 0 ? response.round : 1;
  }

  function testRoundResponses(sessionOrRecord, round) {
    return (sessionOrRecord?.responses || []).filter((response) => testResponseRound(response) === round);
  }

  function testRoundSummary(sessionOrRecord, round) {
    const responses = testRoundResponses(sessionOrRecord, round);
    const wordIds = unique(responses.map((response) => response.wordId));
    const known = responses.filter((response) => response.known).length;
    return {
      round,
      wordIds,
      known,
      unknown: Math.max(0, responses.length - known),
      responseCount: responses.length
    };
  }

  function testConvergenceSummary(sessionOrRecord) {
    const responseRounds = unique((sessionOrRecord?.responses || []).map(testResponseRound)).sort((a, b) => a - b);
    const storedRounds = (sessionOrRecord?.rounds || []).map((round) => round?.round).filter((round) => Number.isInteger(round) && round > 0);
    const roundNumbers = unique([...responseRounds, ...storedRounds]).sort((a, b) => a - b);
    const rounds = roundNumbers.map((round) => {
      const stored = (sessionOrRecord?.rounds || []).find((item) => item.round === round);
      const calculated = testRoundSummary(sessionOrRecord, round);
      return {
        ...calculated,
        wordIds: calculated.wordIds.length ? calculated.wordIds : (stored?.wordIds || []),
        known: calculated.responseCount ? calculated.known : (stored?.known || 0),
        unknown: calculated.responseCount ? calculated.unknown : (stored?.unknown || 0)
      };
    });
    const firstRound = rounds.find((round) => round.round === 1) || { round: 1, wordIds: testSessionWordIds(sessionOrRecord), known: 0, unknown: 0, responseCount: 0 };
    const firstTotal = firstRound.responseCount || firstRound.wordIds.length;
    const lastRound = rounds[rounds.length - 1];
    return {
      rounds,
      firstRound,
      firstKnown: firstRound.known,
      firstUnknown: firstRound.unknown,
      firstTotal,
      firstScore: firstTotal ? Math.round((firstRound.known / firstTotal) * 100) : 0,
      roundCount: rounds.length || 1,
      retryAnswers: Math.max(0, (sessionOrRecord?.responses || []).length - firstTotal),
      converged: Boolean(lastRound?.responseCount && lastRound.unknown === 0)
    };
  }

  function isLearningSession(session) {
    return session?.type === "learning" || session?.type === "relearning";
  }

  function isRelearningSession(session) {
    return session?.type === "relearning";
  }

  function wordIdsForLearningSession(session) {
    if (!session) return [];
    return unique(session.wordIds?.length ? session.wordIds : (session.responses || []).map((response) => response.wordId)).filter(findWord);
  }

  function relearningDifficulties(session) {
    if (!session) return {};
    return session.difficulties || session.wordDifficulties || session.relearningDifficulties || {};
  }

  function relearningDifficultyCounts(wordIds, difficulties) {
    return ["A", "B", "C"].reduce((counts, difficulty) => {
      counts[difficulty] = wordIds.filter((wordId) => difficulties[wordId] === difficulty).length;
      return counts;
    }, {});
  }

  function initialDifficultyLabel(word) {
    return word.initialDifficulty ? `初始難度：${word.initialDifficulty}` : "尚未完成初學";
  }

  function masteryDetail(word) {
    const label = masteryLabel(word);
    if (!word.initialDifficulty || !word.mastery?.nextDueAt) return label;
    return `${label} · 下次 ${dayLabel(word.mastery.nextDueAt)}`;
  }

  function testRecordsForWord(wordId) {
    return state.tests.filter((record) => record.responses?.some((response) => response.wordId === wordId));
  }

  function relearningRecordsForWord(wordId) {
    return state.relearningSessions.filter((record) => (
      record.wordIds?.includes(wordId)
      || record.responses?.some((response) => response.wordId === wordId)
      || Boolean(relearningDifficulties(record)[wordId])
    ));
  }

  function recordLabel(record) {
    if (record.groupLabel) return `${record.groupLabel} · Test #${record.testNumber || "—"}`;
    return record.testNumber ? `Test #${record.testNumber}` : record.scopeLabel || "Test";
  }

  function historyStats(word) {
    const responses = testRecordsForWord(word.id)
      .sort((a, b) => (a.completedAt || 0) - (b.completedAt || 0))
      .map((record) => record.responses.find((response) => response.wordId === word.id))
      .filter(Boolean);
    const recent = responses.slice(-5);
    let streak = 0;
    for (let index = responses.length - 1; index >= 0 && responses[index].known; index -= 1) streak += 1;
    return {
      total: responses.length,
      recentRate: recent.length ? Math.round((recent.filter((response) => response.known).length / recent.length) * 100) : null,
      streak
    };
  }

  function formatUnitProgress(unit) {
    const total = unitWords(unit.id).length;
    const complete = learnedWords(unit.id).length;
    return { total, complete, percent: total ? Math.round((complete / total) * 100) : 0 };
  }

  function unitTopicName(unit) {
    const withoutNumber = String(unit?.name || "")
      .replace(/^Unit\s*\d+\s*[·｜|\-]?\s*/i, "")
      .trim();
    return withoutNumber.replace(/\s*[（(]\d+[）)]\s*$/, "").trim() || withoutNumber || "其他單元";
  }

  function groupedUnits(units) {
    return units.reduce((groups, unit) => {
      const topic = unitTopicName(unit);
      const previous = groups[groups.length - 1];
      if (previous?.topic === topic) previous.units.push(unit);
      else groups.push({ topic, units: [unit] });
      return groups;
    }, []);
  }

  function unitActivityStatus(unit, summary, active) {
    const isReview = active?.type === "test" && active.scope === "review";
    if (active?.unitId === unit.id && !isReview) return "進行中";
    const paused = (state.pausedSessions || []).find((session) => session.unitId === unit.id && !(session.type === "test" && session.scope === "review"));
    if (paused) return "已暫存";
    if (summary.due) return `${summary.due} 待複習`;
    if (!summary.complete) return "尚未開始";
    if (summary.stable === summary.total && summary.total) return "維持中";
    if (summary.complete < summary.total) return "初學中";
    return "建立記憶中";
  }

  function unitStatusTone(unit, summary, active) {
    const isReview = active?.type === "test" && active.scope === "review";
    if (active?.unitId === unit.id && !isReview) return "progress";
    if ((state.pausedSessions || []).some((session) => session.unitId === unit.id && !(session.type === "test" && session.scope === "review"))) return "progress";
    if (summary.due) return "due";
    if (!summary.complete) return "new";
    if (summary.stable === summary.total && summary.total) return "mastered";
    return "progress";
  }

  // This compact meter is adapted from the user-provided v3 prototype.  It
  // visualises the actual long-term score, not the separate initial-learning
  // completion ratio.
  function renderMasteryRing(mastery, size = 46) {
    const score = Math.max(0, Math.min(100, Math.round(mastery || 0)));
    const radius = size / 2 - 4;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference * (1 - score / 100);
    const tone = score >= 100 ? "var(--sage-deep)" : score > 0 ? "var(--coral-deep)" : "var(--ink-faint)";
    return `<span class="unit-ring" role="img" aria-label="長期掌握 ${score}%"><svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none" stroke="var(--line-strong)" stroke-width="4"/><circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none" stroke="${tone}" stroke-width="4" stroke-linecap="round" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" transform="rotate(-90 ${size / 2} ${size / 2})"/><text x="${size / 2}" y="${size / 2 + 4}" text-anchor="middle" font-family="Nunito, sans-serif" font-weight="800" font-size="11" fill="var(--ink)">${score}</text></svg></span>`;
  }

  function renderUnitMemoryBar(summary) {
    const labels = {
      unlearned: "尚未初學",
      initial: "已初學",
      strengthen: "需加強",
      learning: "學習中",
      familiar: "熟悉",
      stable: "穩定"
    };
    const description = Object.entries(labels)
      .filter(([key]) => summary.distribution[key])
      .map(([key, label]) => `${label} ${summary.distribution[key]} 字`)
      .join("、") || "尚無單字";
    return `<div class="unit-memory-bar" role="img" aria-label="${escapeHtml(description)}">
      ${Object.keys(labels).filter((key) => summary.distribution[key]).map((key) => `<span class="unit-memory-segment is-${key}" style="--segment-size:${summary.distribution[key]}" aria-hidden="true"></span>`).join("")}
    </div>`;
  }

  function render() {
    renderWorkspaceChrome();
    const view = state.ui?.view || "home";
    if (view === "learning" || view === "relearning" || view === "test") renderSession();
    else if (view === "completion") renderCompletion();
    else renderHome();
  }

  // The frame only echoes location. All study choices stay beside the content
  // they affect, keeping the practice surface single-purpose and data-neutral.
  function renderWorkspaceChrome() {
    const view = state.ui?.view || "home";
    const tab = state.ui?.tab || "overview";
    const selectedUnit = getUnit(state.ui?.selectedUnitId) || state.units[0];
    const stateLabel = document.getElementById("codex-topbar-state");
    if (!stateLabel) return;
    const isOverview = view === "home" && tab === "overview";

    if (view === "learning" || view === "relearning" || view === "test") {
      stateLabel.textContent = "進行中的練習";
      return;
    }

    if (!isOverview && selectedUnit) {
      stateLabel.textContent = selectedUnit.name;
      return;
    }

    stateLabel.textContent = "總覽";
  }

  function renderTabbar(activeTab) {
    return `<nav class="tabbar" aria-label="Unit 導覽">
      <button class="tab-button ${activeTab === "practice" ? "is-active" : ""}" type="button" data-action="select-tab" data-tab="practice">組別</button>
      <button class="tab-button ${activeTab === "library" ? "is-active" : ""}" type="button" data-action="select-tab" data-tab="library">單字</button>
      <button class="tab-button ${activeTab === "tests" ? "is-active" : ""}" type="button" data-action="select-tab" data-tab="tests">紀錄</button>
    </nav>`;
  }

  function renderGlobalHome(due, active) {
    return `
      <section class="unit-page global-home-page">
        <header class="unit-header global-header">
          <div class="app-brand">
            <p class="app-tagline">今日練習</p>
            <h1 class="app-kicker">今天，從一個小複習開始。</h1>
          </div>
          <label class="select-wrap compact-select">
            <select data-action="select-book" aria-label="選擇書籍">
              ${(state.books || []).map((book) => `<option value="${escapeHtml(book.id)}" ${book.id === currentBookId() ? "selected" : ""}>${escapeHtml(book.name)}</option>`).join("")}
            </select>
          </label>
        </header>
        ${renderOverviewPanel(due, active)}
      </section>`;
  }

  function renderHome() {
    const due = dueWords();
    const active = state.activeSession;
    const activeTab = state.ui.tab || "overview";
    if (activeTab === "overview") {
      app.innerHTML = renderGlobalHome(due, active);
      return;
    }
    const bookUnits = currentBookUnits();
    const selectedUnit = bookUnits.find((unit) => unit.id === state.ui.selectedUnitId) || bookUnits[0];
    if (selectedUnit && state.ui.selectedUnitId !== selectedUnit.id) state.ui.selectedUnitId = selectedUnit.id;
    const selectedProgress = selectedUnit ? formatUnitProgress(selectedUnit) : { total: 0, complete: 0, percent: 0 };
    const selectedMastery = selectedUnit ? unitMasterySummary(selectedUnit) : { total: 0, complete: 0, stable: 0, mastery: 0 };
    const title = selectedUnit?.name || "我的單字庫";
    const headerStatusLabel = `初學 ${selectedMastery.complete} / ${selectedMastery.total}　·　穩定 ${selectedMastery.stable} / ${selectedMastery.total}　·　長期掌握 ${selectedMastery.mastery}%`;

    app.innerHTML = `
      <section class="unit-page">
        <header class="unit-header">
          <div>
            <button class="breadcrumb-button" type="button" data-action="select-tab" data-tab="overview">← 回主畫面</button>
            <h1>${escapeHtml(title)}</h1>
            <p class="unit-status-label">${escapeHtml(headerStatusLabel)}</p>
          </div>
          <div class="header-controls">
            <label class="select-wrap compact-select">
              <select data-action="select-unit" aria-label="選擇單元">
                ${bookUnits.map((unit) => `<option value="${unit.id}" ${unit.id === selectedUnit?.id ? "selected" : ""}>${escapeHtml(unit.name.split(" · ")[0])}</option>`).join("")}
              </select>
            </label>
          </div>
        </header>

        ${renderTabbar(activeTab)}

        ${activeTab === "library" ? renderWordBank(selectedUnit, selectedProgress) : activeTab === "tests" ? renderTestHistory(selectedUnit) : renderPracticePanel(selectedUnit, selectedProgress, due, active)}
      </section>`;
  }

  function renderOverviewPanel(due, active) {
    const activeUnit = active ? getUnit(active.unitId) : null;
    const activeGroup = active?.groupId ? getStudyGroup(active.groupId) : null;
    const isCrossUnitReview = active?.type === "test" && active.scope === "review";
    const pausedSessions = state.pausedSessions || [];
    const pausedSession = pausedSessions[0] || null;
    const pausedUnit = pausedSession ? getUnit(pausedSession.unitId) : null;
    const pausedGroup = pausedSession?.groupId ? getStudyGroup(pausedSession.groupId) : null;
    const pausedIsReview = pausedSession?.type === "test" && pausedSession.scope === "review";
    const resumableSession = active || pausedSession;
    const activityName = resumableSession?.type === "relearning" ? "重新初學" : resumableSession?.type === "test" ? "Test" : "初學";
    const activeScope = active
      ? isCrossUnitReview
        ? "跨 Unit · 今日到期複習"
        : `${activeUnit?.name || "目前 Unit"} · ${activeGroup ? studyGroupLabel(activeGroup) : active.scopeLabel || "這組"}`
      : "";
    const action = active
      ? { label: "繼續上次的練習", detail: `${activeScope} · ${Math.min((active.index || 0) + 1, active.queue?.length || 0)} / ${active.queue?.length || 0}`, action: "resume-session" }
      : pausedSession
        ? { label: "繼續上次的練習", detail: pausedIsReview ? "今日到期複習" : pausedGroup ? `${pausedUnit?.name || ""} · ${studyGroupLabel(pausedGroup)}` : pausedUnit?.name || "一組練習", action: "resume-paused-session", sessionId: pausedSession.id }
        : due.length
          ? { label: "開始今天的複習", detail: `分布在 ${new Set(due.map((word) => word.unitId)).size} 個 Unit`, action: "start-review" }
          : null;
    const greeting = active || pausedSession
      ? `${escapeHtml(activityName)}還沒結束`
      : due.length
        ? `今天有 ${due.length} 個字該複習了`
        : "今天沒有排定的複習";
    const subtitle = active || pausedSession
      ? "可以從剛剛停下的地方繼續。"
      : due.length ? "準備好時再開始。" : "也可以自由選一組開始。";

    const bookUnits = currentBookUnits();
    const unitSections = groupedUnits(bookUnits).map((section) => {
      const rows = section.units.map((unit) => {
        const summary = unitMasterySummary(unit);
        const status = unitActivityStatus(unit, summary, active);
        const tone = unitStatusTone(unit, summary, active);
        return `<button class="overview-unit-row" type="button" data-action="open-unit-practice" data-unit-id="${escapeHtml(unit.id)}" aria-label="進入 ${escapeHtml(unit.name)}，${escapeHtml(status)}">
          ${renderMasteryRing(summary.mastery)}
          <div class="overview-unit-copy"><strong>${escapeHtml(unit.name)}</strong><span class="overview-unit-meta"><span>單字 <b>${summary.total}</b></span><span>已初學 <b>${summary.complete} / ${summary.total}</b></span>${summary.due ? `<span>複習 <b>今天</b></span>` : ""}</span></div>
          <span class="status-chip status-${tone}">${tone === "due" ? `<i class="status-dot" aria-hidden="true"></i>` : ""}${escapeHtml(status)}</span>
          <span class="overview-unit-arrow" aria-hidden="true">›</span>
        </button>`;
      }).join("");
      const heading = section.units.length > 1 ? `<div class="overview-unit-section-heading"><strong>${escapeHtml(section.topic)}</strong><span>${section.units.length} 個 Unit</span></div>` : "";
      return `<section class="overview-unit-section">${heading}${rows}</section>`;
    }).join("") || `<p class="overview-empty-copy">還沒有 Unit。新增單元後會自動出現在這裡。</p>`;

    return `
      <section class="today-strip" aria-label="目前建議的練習"><div class="today-greeting"><span class="today-label">現在</span><strong>${greeting}</strong><p>${escapeHtml(subtitle)}</p></div>${due.length ? `<div class="today-numbers"><span><b class="is-accent">${due.length}</b>待複習</span></div>` : ""}${action ? `<button class="resume-button" type="button" data-action="${action.action}" ${action.sessionId ? `data-session-id="${escapeHtml(action.sessionId)}"` : ""}>${escapeHtml(action.label)} <span aria-hidden="true">→</span></button>` : ""}</section>
      <section class="overview-unit-panel">
        <div class="overview-unit-panel-heading"><span class="overview-eyebrow">${escapeHtml(getBook(currentBookId())?.name || "全部 Unit")}</span></div>
        <div class="overview-unit-list">${unitSections}</div>
      </section>`;
  }

  function renderStudyGroupCard(group, active) {
    const detail = studyGroupProgress(group);
    const hasInitialLearning = detail.complete === detail.total && detail.total > 0;
    const isActiveGroup = detail.active;
    const pausedSession = detail.paused;
    let status = "new";
    let statusLabel = "尚未初學";
    let actionLabel = "開始初學";
    let action = "start-group-learning";

    if (isActiveGroup) {
      status = "active";
      statusLabel = active.type === "test" ? "Test 進行中" : active.type === "relearning" ? "重測初始中" : "初學進行中";
      actionLabel = active.type === "test" ? "繼續 Test" : active.type === "relearning" ? "繼續重測" : "繼續初學";
      action = "resume-session";
    } else if (pausedSession) {
      status = "paused";
      statusLabel = pausedSession.type === "test" ? "Test 已暫存" : pausedSession.type === "relearning" ? "重測已暫存" : "初學已暫存";
      actionLabel = "繼續";
      action = "resume-paused-session";
    } else if (hasInitialLearning) {
      status = detail.tests.length ? "tested" : "complete";
      statusLabel = detail.tests.length ? `已 Test ${detail.tests.length} 次` : "可開始 Test";
      actionLabel = detail.tests.length ? "再測本組" : "Test 本組";
      action = "start-group-test";
    } else if (detail.complete) {
      status = "partial";
      statusLabel = "初學尚未完成";
      actionLabel = "補完初學";
    }

    const record = hasInitialLearning
      ? `<div class="group-counts" aria-label="本組初始難度"><span>A <strong>${detail.counts.A}</strong></span><span>B <strong>${detail.counts.B}</strong></span><span>C <strong>${detail.counts.C}</strong></span></div>`
      : `<span class="group-insight">待完成初學</span>`;
    return `<article class="study-group-card">
      <div class="group-card-top"><span class="group-number">${escapeHtml(studyGroupLabel(group))}</span><span class="group-status" data-status="${status}">${statusLabel}</span></div>
      <div class="group-progress"><div><span>初學</span><strong>${detail.complete} / ${detail.total}</strong></div><progress max="${Math.max(detail.total, 1)}" value="${detail.complete}"></progress></div>
      <div class="group-record"><span class="group-cell-label">初始</span>${record}</div>
      <div class="group-card-actions">
        <button class="${action === "start-group-test" ? "button" : "button-secondary"}" type="button" data-action="${action}" data-group-id="${escapeHtml(group.id)}" ${pausedSession ? `data-session-id="${escapeHtml(pausedSession.id)}"` : ""}>${actionLabel}</button>
        <button class="text-button" type="button" data-action="open-study-group" data-group-id="${escapeHtml(group.id)}">查看 ${detail.total} 字</button>
      </div>
    </article>`;
  }

  function renderPracticePanel(unit, _progress, _due, active) {
    if (!unit) return `<section class="practice-panel"><h2>先新增一個單元開始。</h2><button class="button" type="button" data-action="open-import">新增單元</button></section>`;
    const groups = groupsForUnit(unit.id);
    const isCrossUnitReview = active?.type === "test" && active.scope === "review";
    const activeInThisUnit = active && active.unitId === unit.id && !isCrossUnitReview;
    return `
      <section class="group-list" aria-label="練習組別">
        <div class="group-list-heading" aria-hidden="true"><span>組別</span><span>初學</span><span>初始紀錄</span><span>操作</span></div>
        <div class="group-grid">${groups.map((group) => renderStudyGroupCard(group, active)).join("") || `<div class="empty-history">這個單元尚未建立組別。</div>`}</div>
      </section>
      `;
  }

  function renderWordBank(unit, progress) {
    if (!unit) return "";
    const words = unitWords(unit.id).slice().sort((a, b) => a.term.localeCompare(b.term));
    const summary = unitMasterySummary(unit);
    return `
      <section class="wordbank-toolbar"><div><p><strong>${words.length}</strong> 個單字　·　已初學 ${progress.complete}　·　穩定 ${summary.stable}</p><small>依英文字母排序；點選單字可查看完整紀錄。</small></div><span class="wordbank-mastery">長期掌握 ${summary.mastery}%</span></section>
      <div class="wordbank-columns" aria-hidden="true"><span>英文</span><span>中文</span></div>
      <section class="wordbank-list" aria-label="單字清單">
        ${words.map((word) => `<button class="wordbank-row" type="button" data-action="open-word-detail" data-word-id="${word.id}"><b>${escapeHtml(word.term)}</b><span>${escapeHtml(word.meaning)}</span></button>`).join("")}
      </section>`;
  }

  function renderTestHistory(unit) {
    if (!unit) return "";
    const records = state.tests.filter((record) => record.responses?.some((response) => findWord(response.wordId)?.unitId === unit.id));
    return `
      <section class="history-toolbar"><p>${records.length ? `已保存 ${records.length} 次 Test；每一筆都可查看完整答題結果。` : "完成初學後即可開始 Test；每一次結果都會永久保留。"}</p></section>
      <section class="history-list" aria-label="Test 歷史紀錄">
        ${records.length ? records.map((record) => {
          const convergence = testConvergenceSummary(record);
          const firstRound = testRoundResponses(record, 1).filter((response) => findWord(response.wordId)?.unitId === unit.id);
          const known = firstRound.filter((response) => response.known).length;
          const unknown = firstRound.length - known;
          const score = firstRound.length ? Math.round((known / firstRound.length) * 100) : convergence.firstScore;
          const convergenceLabel = convergence.converged
            ? convergence.roundCount > 1 ? `第 ${convergence.roundCount} 輪收斂完成` : "第 1 輪全對"
            : convergence.firstUnknown ? "舊版單輪紀錄" : "第 1 輪全對";
          return `<button class="history-row" type="button" data-action="open-test-record" data-record-id="${record.id}"><b>${recordLabel(record)}</b><span>${dateTimeLabel(record.completedAt)}</span><span>第一輪：會 ${known}　不會 ${unknown}　${score}%　·　${convergenceLabel}</span><i>查看詳細結果</i></button>`;
        }).join("") : `<div class="empty-history">尚未有 Test 紀錄。</div>`}
      </section>`;
  }

  function renderSession() {
    const session = state.activeSession;
    if (!session) {
      state.ui.view = "home";
      renderHome();
      return;
    }
    const unit = getUnit(session.unitId);
    const word = findWord(session.queue[session.index]);
    if (!unit || !word) {
      state.activeSession = null;
      state.ui.view = "home";
      storeState(state).then(render);
      return;
    }
    const total = session.queue.length;
    const position = session.index + 1;
    const isLearning = isLearningSession(session);
    const isRelearning = isRelearningSession(session);
    const testRound = Number.isInteger(session.round) && session.round > 0 ? session.round : 1;
    const sessionWordIds = isLearning ? currentBatchWordIds(session) : testSessionWordIds(session);
    const sessionGroup = session.groupId ? getStudyGroup(session.groupId) : null;
    const groupCaption = sessionGroup ? studyGroupLabel(sessionGroup) : `第 ${session.batchNumber || "—"} 組`;
    const title = isLearning
      ? `${isRelearning ? "重新初學" : "初學"} · 第 ${session.round} 輪`
      : `${session.scopeLabel} · 第 ${testRound} 輪`;
    const scopeCaption = isRelearning
      ? `${escapeHtml(unit.name)} · 原第 ${session.sourceBatchNumber || session.batchNumber} 組 · 共 ${sessionWordIds.length} 字 · 重新測初始狀況`
      : isLearning
        ? `${escapeHtml(unit.name)} · ${groupCaption} · 共 ${sessionWordIds.length} 字`
      : session.scope === "review"
        ? `跨 Unit · ${session.scopeLabel} · 本次共 ${sessionWordIds.length} 字`
        : `${escapeHtml(unit.name)} · ${groupCaption} · 共 ${sessionWordIds.length} 字`;
    const currentRoundDetail = isLearning
      ? `${position} / ${total}`
      : `第 ${testRound} 輪 · 本輪 ${total} 字 · ${position} / ${total}`;
    app.innerHTML = `
      <section class="unit-page session-page">
        <header class="unit-header">
          <div><h1>${escapeHtml(unit.name)}</h1><p class="unit-subtitle">${scopeCaption}</p></div>
          <div class="session-actions">
            <button class="text-button" type="button" data-action="open-current-batch">查看${session.scope === "review" ? "本次" : "本組"} ${sessionWordIds.length} 字</button>
            <button class="text-button" type="button" data-action="go-home">儲存並離開</button>
          </div>
        </header>
        <section class="session-meta"><p>${title}</p><p>${currentRoundDetail}</p></section>
        <section class="card-stage">
          <button class="flashcard" type="button" data-action="flip-card" aria-label="翻面查看答案">
          ${session.flipped ? `
            <div class="card-meaning">${escapeHtml(word.meaning)}</div>
            <div class="card-hint"></div>` : `
            <div class="card-word">${escapeHtml(word.term)}</div>
            <div class="card-hint">點擊字卡翻面</div>`}
          </button>
          <div class="answer-row">
            <button class="answer-button" type="button" data-action="answer" data-known="false">不會</button>
            <button class="answer-button known" type="button" data-action="answer" data-known="true">會</button>
          </div>
        </section>
      </section>`;
  }

  function renderCompletion() {
    const result = state.lastCompletion;
    if (!result) {
      state.ui.view = "home";
      renderHome();
      return;
    }
    const unit = getUnit(result.unitId);
    const isInitialLearning = result.type === "learning";
    const isRelearning = result.type === "relearning";
    const isLearning = isInitialLearning || isRelearning;
    const resultWordIds = result.wordIds?.length ? result.wordIds : unique((result.responses || []).map((item) => item.wordId));
    const convergence = isLearning ? null : testConvergenceSummary(result);
    const firstRoundResponseMap = new Map(isLearning ? [] : testRoundResponses(result, 1).map((response) => [response.wordId, response]));
    const finalResponses = isLearning
      ? unique(result.responses.map((item) => item.wordId)).map((wordId) => [...result.responses].reverse().find((item) => item.wordId === wordId)).filter(Boolean)
      : resultWordIds.map((wordId) => firstRoundResponseMap.get(wordId)).filter(Boolean);
    const known = finalResponses.filter((item) => item.known).map((item) => findWord(item.wordId)).filter(Boolean);
    const unknown = finalResponses.filter((item) => !item.known).map((item) => findWord(item.wordId)).filter(Boolean);
    const score = isLearning
      ? (result.responses.length ? Math.round((known.length / result.responses.length) * 100) : 0)
      : convergence.firstScore;
    const counts = result.counts || {};
    const convergenceText = !isLearning
      ? convergence.converged
        ? convergence.roundCount > 1
          ? `第一輪答錯的 ${convergence.firstUnknown} 個字已逐輪重測，於第 ${convergence.roundCount} 輪全部答對。`
          : "第一輪即全部答對。"
        : `第一輪：會 ${convergence.firstKnown} 個，不會 ${convergence.firstUnknown} 個。`
      : "";
    app.innerHTML = `
      <section class="unit-page">
      <section class="completion">
        <p class="completion-label">${isRelearning ? "重新初學紀錄已儲存" : isInitialLearning ? "初學紀錄已儲存" : "Test 已儲存"}</p>
        <h1>${isRelearning ? `原第 ${result.sourceBatchNumber || result.batchNumber} 組重新初學完成` : isInitialLearning ? `第 ${result.batchNumber} 組完成` : escapeHtml(result.scopeLabel)}</h1>
        ${isLearning ? `
          <div class="difficulty-result" aria-label="${isRelearning ? "本組重新初學難度統計" : "本組初始難度統計"}">
            ${["A", "B", "C"].map((difficulty) => `<button type="button" data-action="open-completion-difficulty" data-difficulty="${difficulty}"><strong>${difficulty}</strong><span>${counts[difficulty] || 0} 個</span><i>查看</i></button>`).join("")}
          </div>
          <p class="body-copy">${isRelearning
            ? "這次 A／B／C 只會作為重新初學紀錄保存；第一次初學的 A／B／C、目前熟練度與所有 Test 都不會被改寫。"
            : "A／B／C 是你第一次接觸這個字的難度，會永久保留；到複習日的 Test 首輪答對，才會讓長期掌握前進。"}</p>` : `
          <div class="score">${score}%</div>
          <p class="body-copy">第一輪：會 ${known.length} 個，不會 ${unknown.length} 個。${convergenceText} 只有首輪會用來更新長期掌握；後續收斂輪只作為練習，不會灌高熟練度。</p>`}
        <div class="result-columns">
          <div class="result-list"><h3>${isLearning ? "最後一輪答對" : "首輪答對"} ${known.length}</h3><ul>${known.slice(0, 16).map((word) => `<li>${escapeHtml(word.term)}</li>`).join("") || "<li>—</li>"}</ul></div>
          <div class="result-list"><h3>${isLearning ? "最後一輪答錯" : "首輪答錯（已後續重測）"} ${unknown.length}</h3><ul>${unknown.slice(0, 16).map((word) => `<li>${escapeHtml(word.term)}</li>`).join("") || "<li>—</li>"}</ul></div>
        </div>
        <div class="button-row" style="justify-content:center">
          ${isLearning ? `<button class="button-secondary" type="button" data-action="open-completed-batch">查看${isRelearning ? "重新初學本組" : "本組"} ${result.wordIds?.length || unique(result.responses.map((item) => item.wordId)).length} 字</button>` : `<button class="button-secondary" type="button" data-action="open-last-test-result">查看完整結果</button>`}
          <button class="button" type="button" data-action="open-unit-practice" data-unit-id="${escapeHtml(result.unitId)}">${result.groupId ? "回到這組" : "回到單元"}</button>
        </div>
      </section></section>`;
  }

  function startLearning(unitId, groupId = null) {
    const group = groupId ? getStudyGroup(groupId) : null;
    if (group && group.unitId !== unitId) return;
    if (group && sessionBelongsToGroup(state.activeSession, group)) {
      state.ui = { ...state.ui, view: "learning", selectedUnitId: unitId };
      return true;
    }
    const pausedSession = group ? pausedSessionForGroup(group) : null;
    if (pausedSession) return resumePausedSession(pausedSession.id);
    const remaining = group
      ? studyGroupWords(group).filter((word) => !word.initialDifficulty)
      : remainingWords(unitId);
    if (!remaining.length) return;
    if (state.activeSession) pauseActiveSession();
    const selected = group ? shuffle(remaining) : shuffle(remaining).slice(0, 20);
    const unit = getUnit(unitId);
    state.activeSession = {
      id: uid(), type: "learning", unitId, queue: selected.map((word) => word.id), index: 0, round: 1,
      batchNumber: group?.groupNumber || Math.floor(learnedWords(unitId).length / 20) + 1,
      batchWordIds: group ? groupWordIds(group) : selected.map((word) => word.id),
      ...(group ? { groupId: group.id } : {}),
      responses: [], flipped: false, startedAt: now()
    };
    state.ui = { ...state.ui, view: "learning", selectedUnitId: unit?.id };
    return true;
  }

  function startRelearning(sourceSessionId) {
    const sourceSession = state.learningSessions.find((session) => session.id === sourceSessionId && session.completedAt);
    const wordIds = wordIdsForLearningSession(sourceSession);
    if (!sourceSession || !wordIds.length || !getUnit(sourceSession.unitId)) return false;
    const sourceGroup = sourceSession.groupId
      ? getStudyGroup(sourceSession.groupId)
      : findStudyGroupByWordIds(state.studyGroups, sourceSession.unitId, wordIds);
    if (sourceGroup && sessionBelongsToGroup(state.activeSession, sourceGroup)) {
      state.ui = { ...state.ui, view: "learning", selectedUnitId: sourceSession.unitId };
      return true;
    }
    const pausedSession = sourceGroup ? pausedSessionForGroup(sourceGroup) : null;
    if (pausedSession) return resumePausedSession(pausedSession.id);
    if (state.activeSession) pauseActiveSession();
    const priorAttempts = state.relearningSessions.filter((session) => session.sourceLearningSessionId === sourceSession.id).length;
    state.activeSession = {
      id: uid(),
      type: "relearning",
      unitId: sourceSession.unitId,
      queue: shuffle(wordIds),
      index: 0,
      round: 1,
      batchNumber: sourceGroup?.groupNumber || sourceSession.batchNumber,
      batchWordIds: wordIds,
      ...(sourceGroup ? { groupId: sourceGroup.id } : {}),
      sourceLearningSessionId: sourceSession.id,
      sourceBatchNumber: sourceSession.batchNumber,
      sourceCompletedAt: sourceSession.completedAt,
      relearningNumber: priorAttempts + 1,
      relearningDifficulties: {},
      responses: [],
      flipped: false,
      startedAt: now()
    };
    state.ui = { ...state.ui, view: "learning", selectedUnitId: sourceSession.unitId };
    return true;
  }

  function startTest(unitId, scope, options = {}) {
    const config = typeof options === "string" ? { groupId: options } : (options || {});
    const targetGroup = config.groupId ? getStudyGroup(config.groupId) : null;
    if (targetGroup && sessionBelongsToGroup(state.activeSession, targetGroup)) {
      state.ui = { ...state.ui, view: "test", selectedUnitId: unitId };
      return true;
    }
    const pausedSession = targetGroup ? pausedSessionForGroup(targetGroup) : null;
    if (pausedSession) return resumePausedSession(pausedSession.id);
    const candidates = learnedWords(unitId);
    if (!candidates.length) return;
    const requestedWords = Array.isArray(config.wordIds)
      ? config.wordIds.map(findWord).filter((word) => word?.unitId === unitId && word.initialDifficulty)
      : [];
    const words = requestedWords.length
      ? shuffle(unique(requestedWords))
      : scope === "unit" ? shuffle(candidates) : shuffle(candidates).slice(0, 20);
    if (!words.length) return;
    if (state.activeSession) pauseActiveSession();
    const testNumber = state.tests.filter((record) => record.unitId === unitId && record.scope !== "review").length + 1;
    state.activeSession = {
      id: uid(), type: "test", unitId, queue: words.map((word) => word.id), index: 0,
      wordIds: words.map((word) => word.id), batchWordIds: words.map((word) => word.id), round: 1, rounds: [],
      scope, testNumber, groupId: config.groupId || null, groupLabel: config.groupLabel || null,
      scopeLabel: config.scopeLabel || `Test #${testNumber} · ${scope === "unit" ? "整個單元" : "隨機 ${words.length} 字"}`,
      responses: [], flipped: false, startedAt: now()
    };
    state.ui = { ...state.ui, view: "test", selectedUnitId: unitId };
    return true;
  }

  function startGroupTest(groupId) {
    const group = getStudyGroup(groupId);
    if (!group) return false;
    const words = studyGroupWords(group);
    if (!words.length || words.some((word) => !word.initialDifficulty)) return false;
    startTest(group.unitId, "group", {
      groupId: group.id,
      groupLabel: studyGroupLabel(group),
      wordIds: groupWordIds(group),
      scopeLabel: `${studyGroupLabel(group)} Test`
    });
    return true;
  }

  function startReview() {
    if (state.activeSession?.type === "test" && state.activeSession.scope === "review") {
      state.ui = { ...state.ui, view: "test", selectedUnitId: state.activeSession.unitId };
      return true;
    }
    const pausedReview = (state.pausedSessions || []).find((session) => session.type === "test" && session.scope === "review");
    if (pausedReview) return resumePausedSession(pausedReview.id);
    const priority = dueWords().sort((a, b) => {
      const combinationPriority = {
        "C|需加強": 0, "B|需加強": 1, "A|需加強": 2,
        "C|已初學": 3, "B|已初學": 4, "A|已初學": 5,
        "C|學習中": 6, "B|學習中": 7, "A|學習中": 8,
        "C|熟悉": 9, "B|熟悉": 10, "A|熟悉": 11,
        "C|穩定": 12, "B|穩定": 13, "A|穩定": 14
      };
      const dueDifference = (a.mastery?.nextDueAt || 0) - (b.mastery?.nextDueAt || 0);
      const aPriority = combinationPriority[`${a.initialDifficulty}|${masteryLabel(a)}`] ?? 99;
      const bPriority = combinationPriority[`${b.initialDifficulty}|${masteryLabel(b)}`] ?? 99;
      return aPriority - bPriority || dueDifference;
    });
    const selected = shuffle(priority.slice(0, 20));
    if (!selected.length) return;
    if (state.activeSession) pauseActiveSession();
    const firstUnit = selected[0].unitId;
    state.activeSession = {
      id: uid(), type: "test", unitId: firstUnit, queue: selected.map((word) => word.id), index: 0,
      wordIds: selected.map((word) => word.id), batchWordIds: selected.map((word) => word.id), round: 1, rounds: [],
      scope: "review", scopeLabel: "今日到期複習", responses: [], flipped: false, startedAt: now()
    };
    state.ui = { ...state.ui, view: "test", selectedUnitId: firstUnit };
    return true;
  }

  function masteryGapAfterStage(word, stage) {
    return reviewIntervals[Math.max(1, Math.min(5, stage)) - 1];
  }

  function createInitialMastery(word, establishedAt = now()) {
    const difficulty = word.initialDifficulty || "C";
    return {
      modelVersion: 2,
      stage: 1,
      tests: 0,
      qualifiedCount: 0,
      lastScoredAt: null,
      lastScoredDay: null,
      lastTestAt: null,
      lastTestCorrect: null,
      needsRecovery: false,
      status: "已初學",
      nextDueAt: establishedAt + (initialGap[difficulty] || 1) * DAY
    };
  }

  function dueOnOrBeforeDay(dueAt, testedAt) {
    return Boolean(dueAt) && taipeiDayKey(testedAt) >= taipeiDayKey(dueAt);
  }

  function syncMasteryStatus(word, mastery) {
    if (mastery.needsRecovery) mastery.status = "需加強";
    else if (mastery.stage === 1) mastery.status = "已初學";
    else if (mastery.stage <= 3) mastery.status = "學習中";
    else if (mastery.stage === 4) mastery.status = "熟悉";
    else mastery.status = "穩定";
    word.mastery = mastery;
  }

  function establishInitialDifficulty(word, difficulty, learningResponses) {
    const completedAt = now();
    word.initialDifficulty = difficulty;
    word.initialLearning = { completedAt, rounds: learningResponses.filter((item) => item.wordId === word.id) };
    word.mastery = createInitialMastery(word, completedAt);
  }

  function answerLearning(known) {
    const session = state.activeSession;
    const wordId = session.queue[session.index];
    session.responses.push({ wordId, known, round: session.round, at: now() });
    const word = findWord(wordId);
    if (session.round === 1 && known) establishInitialDifficulty(word, "A", session.responses);
    if (session.round === 2 && known) establishInitialDifficulty(word, "B", session.responses);
    if (session.round === 3) establishInitialDifficulty(word, "C", session.responses);

    if (session.index < session.queue.length - 1) {
      session.index += 1;
      session.flipped = false;
      return;
    }
    if (session.round < 3) {
      const nextQueue = session.queue.filter((candidateId) => {
        const candidate = findWord(candidateId);
        return candidate && !candidate.initialDifficulty;
      });
      if (nextQueue.length) {
        session.queue = shuffle(nextQueue);
        session.index = 0;
        session.round += 1;
        session.flipped = false;
        return;
      }
    }
    completeLearningSession();
  }

  function completeLearningSession() {
    const session = state.activeSession;
    const words = session.responses.map((response) => findWord(response.wordId)).filter(Boolean);
    const counts = difficultyCounts(unique(words).map((word) => word));
    const completedAt = now();
    state.learningSessions.unshift({
      id: session.id,
      unitId: session.unitId,
      batchNumber: session.batchNumber,
      ...(session.groupId ? { groupId: session.groupId } : {}),
      startedAt: session.startedAt,
      completedAt,
      wordIds: currentBatchWordIds(session),
      responses: structuredClone(session.responses),
      counts
    });
    state.lastCompletion = { type: "learning", unitId: session.unitId, batchNumber: session.batchNumber, ...(session.groupId ? { groupId: session.groupId } : {}), wordIds: currentBatchWordIds(session), responses: session.responses, counts, completedAt };
    state.activeSession = null;
    state.ui.view = "completion";
  }

  function answerRelearning(known) {
    const session = state.activeSession;
    if (!session || session.type !== "relearning") return;
    const wordId = session.queue[session.index];
    session.responses.push({ wordId, known, round: session.round, at: now() });
    session.relearningDifficulties ||= {};
    if (session.round === 1 && known) session.relearningDifficulties[wordId] = "A";
    if (session.round === 2 && known) session.relearningDifficulties[wordId] = "B";
    if (session.round === 3) session.relearningDifficulties[wordId] = "C";

    if (session.index < session.queue.length - 1) {
      session.index += 1;
      session.flipped = false;
      return;
    }
    if (session.round < 3) {
      const nextQueue = session.queue.filter((candidateId) => !session.relearningDifficulties[candidateId]);
      if (nextQueue.length) {
        session.queue = shuffle(nextQueue);
        session.index = 0;
        session.round += 1;
        session.flipped = false;
        return;
      }
    }
    completeRelearningSession();
  }

  function completeRelearningSession() {
    const session = state.activeSession;
    if (!session || session.type !== "relearning") return;
    const wordIds = currentBatchWordIds(session);
    const difficulties = structuredClone(session.relearningDifficulties || {});
    const completedAt = now();
    const counts = relearningDifficultyCounts(wordIds, difficulties);
    const record = {
      id: session.id,
      unitId: session.unitId,
      ...(session.groupId ? { groupId: session.groupId } : {}),
      sourceLearningSessionId: session.sourceLearningSessionId,
      sourceBatchNumber: session.sourceBatchNumber || session.batchNumber,
      sourceCompletedAt: session.sourceCompletedAt || null,
      relearningNumber: session.relearningNumber || 1,
      startedAt: session.startedAt,
      completedAt,
      wordIds,
      difficulties,
      responses: structuredClone(session.responses),
      counts
    };
    state.relearningSessions.unshift(record);
    state.lastCompletion = {
      type: "relearning",
      unitId: record.unitId,
      ...(record.groupId ? { groupId: record.groupId } : {}),
      sourceLearningSessionId: record.sourceLearningSessionId,
      sourceBatchNumber: record.sourceBatchNumber,
      relearningNumber: record.relearningNumber,
      wordIds: record.wordIds,
      difficulties: record.difficulties,
      responses: record.responses,
      counts: record.counts,
      completedAt: record.completedAt
    };
    state.activeSession = null;
    state.ui.view = "completion";
  }

  function applyTestResult(word, known, testedAt) {
    if (!word?.initialDifficulty) return;
    const mastery = word.mastery?.modelVersion === 2
      ? word.mastery
      : createInitialMastery(word, word.initialLearning?.completedAt || testedAt);
    const day = taipeiDayKey(testedAt);
    mastery.tests = (mastery.tests || 0) + 1;
    mastery.lastTestAt = testedAt;
    mastery.lastTestCorrect = known;

    // A Test may repeat missed words in later rounds.  Only the first
    // answer from the first Test on a Taiwan calendar day can change memory.
    if (mastery.lastScoredDay === day) {
      syncMasteryStatus(word, mastery);
      return;
    }

    if (!known) {
      mastery.stage = Math.max(1, Number.isInteger(mastery.stage) ? mastery.stage - 1 : masteryStage(word) - 1);
      mastery.needsRecovery = true;
      mastery.lastScoredAt = testedAt;
      mastery.lastScoredDay = day;
      mastery.nextDueAt = testedAt + DAY;
      syncMasteryStatus(word, mastery);
      return;
    }

    // An early correct answer is useful practice and remains in Test history,
    // but it does not prove retention across the intended interval.
    if (!dueOnOrBeforeDay(mastery.nextDueAt, testedAt)) {
      syncMasteryStatus(word, mastery);
      return;
    }

    mastery.lastScoredAt = testedAt;
    mastery.lastScoredDay = day;
    if (mastery.needsRecovery) {
      mastery.needsRecovery = false;
    } else {
      mastery.stage = Math.min(5, Number.isInteger(mastery.stage) ? mastery.stage + 1 : masteryStage(word) + 1);
      mastery.qualifiedCount = Math.max(mastery.qualifiedCount || 0, mastery.stage - 1);
    }
    mastery.nextDueAt = testedAt + masteryGapAfterStage(word, mastery.stage) * DAY;
    syncMasteryStatus(word, mastery);
  }

  function answerTest(known) {
    const session = state.activeSession;
    if (!session || session.type !== "test") return;
    const wordId = session.queue[session.index];
    const round = Number.isInteger(session.round) && session.round > 0 ? session.round : 1;
    const testedAt = now();
    session.responses.push({ wordId, known, round, at: testedAt });
    if (session.index < session.queue.length - 1) {
      session.index += 1;
      session.flipped = false;
      return;
    }
    const roundResponses = testRoundResponses(session, round);
    const wrongWordIds = session.queue.filter((candidateId) => {
      const answer = [...roundResponses].reverse().find((response) => response.wordId === candidateId);
      return !answer?.known;
    });
    session.rounds ||= [];
    const roundSummary = {
      ...testRoundSummary(session, round),
      wordIds: [...session.queue],
      completedAt: testedAt
    };
    const previousRoundIndex = session.rounds.findIndex((item) => item.round === round);
    if (previousRoundIndex >= 0) session.rounds[previousRoundIndex] = roundSummary;
    else session.rounds.push(roundSummary);
    if (wrongWordIds.length) {
      session.queue = shuffle(wrongWordIds);
      session.index = 0;
      session.round = round + 1;
      session.flipped = false;
      return;
    }
    completeTestSession();
  }

  function completeTestSession() {
    const session = state.activeSession;
    if (!session || session.type !== "test") return;
    const wordIds = testSessionWordIds(session);
    const firstRound = new Map();
    for (const response of session.responses || []) {
      if (testResponseRound(response) !== 1 || firstRound.has(response.wordId)) continue;
      firstRound.set(response.wordId, response);
    }
    // Later convergence rounds are purposeful practice, not another proof of
    // long-term retention.  One first-round response per word is applied here.
    for (const wordId of wordIds) {
      const response = firstRound.get(wordId);
      const word = findWord(wordId);
      if (word && response) applyTestResult(word, response.known, response.at || now());
    }
    const record = {
      id: uid(), unitId: session.unitId, scope: session.scope, scopeLabel: session.scopeLabel,
      testNumber: session.testNumber || null, startedAt: session.startedAt, completedAt: now(),
      wordIds, responses: structuredClone(session.responses), rounds: structuredClone(session.rounds || []),
      ...(session.groupId ? { groupId: session.groupId } : {}),
      ...(session.groupLabel ? { groupLabel: session.groupLabel } : {})
    };
    state.tests.unshift(record);
    state.lastCompletion = {
      type: "test", recordId: record.id, unitId: session.unitId, scopeLabel: session.scopeLabel,
      responses: structuredClone(session.responses), wordIds, rounds: structuredClone(record.rounds),
      ...(record.groupId ? { groupId: record.groupId } : {}),
      ...(record.groupLabel ? { groupLabel: record.groupLabel } : {}),
      completedAt: record.completedAt
    };
    state.activeSession = null;
    state.ui.view = "completion";
  }

  function wordRows(words, responseMap = new Map(), { difficultyMap = null, difficultyPrefix = "重新初學" } = {}) {
    return words.map((word) => {
      const response = responseMap.get(word.id);
      const difficultyText = difficultyMap ? `${difficultyPrefix}：${difficultyMap[word.id] || "—"}` : initialDifficultyLabel(word);
      const result = response
        ? `<em class="${response.known ? "result-known" : "result-unknown"}">${response.known ? "✓ 會" : "✕ 不會"}　${difficultyText}</em>`
        : difficultyMap ? `<em>${difficultyText}</em>` : "";
      return `<button class="modal-word-row" type="button" data-action="open-word-detail" data-word-id="${escapeHtml(word.id)}"><b>${escapeHtml(word.term)}</b><span>${escapeHtml(word.meaning)}</span>${result}</button>`;
    }).join("") || `<p class="empty-history">沒有符合的單字。</p>`;
  }

  function openBatchModal({ title, wordIds, subtitle = "", responses = [], difficulty = null, difficultyMap = null, difficultyPrefix = "重新初學", footer = "" }) {
    const responseMap = new Map(responses.map((response) => [response.wordId, response]));
    const words = unique(wordIds).map(findWord).filter(Boolean)
      .filter((word) => !difficulty || (difficultyMap ? difficultyMap[word.id] === difficulty : word.initialDifficulty === difficulty));
    openModal(`
      <div class="modal-header"><div><h2>${escapeHtml(title)}</h2><p class="body-copy">${escapeHtml(subtitle || `共 ${words.length} 個單字`)}</p></div><button class="modal-close" type="button" data-action="close-modal">關閉</button></div>
      <section class="modal-word-list">${wordRows(words, responseMap, { difficultyMap, difficultyPrefix })}</section>
      ${footer}`);
  }

  function openStudyGroupModal(groupId) {
    const group = getStudyGroup(groupId);
    if (!group) return;
    const detail = studyGroupProgress(group);
    const isActiveGroup = detail.active;
    const hasInitialLearning = detail.complete === detail.total && detail.total > 0;
    const pausedSession = detail.paused;
    const relearningSource = hasInitialLearning ? completedLearningSessionForGroup(group) : null;
    const action = isActiveGroup ? "resume-session" : pausedSession ? "resume-paused-session" : hasInitialLearning ? "start-group-test" : "start-group-learning";
    const label = isActiveGroup
      ? state.activeSession.type === "test" ? "繼續 Test" : "繼續初學"
      : pausedSession ? "繼續"
      : hasInitialLearning ? (detail.tests.length ? "再測本組" : "Test 本組") : (detail.complete ? "補完初學" : "開始初學");
    openBatchModal({
      title: `${studyGroupLabel(group)} · 本組單字`,
      wordIds: groupWordIds(group),
      subtitle: hasInitialLearning
        ? `初學完成；初始 A ${detail.counts.A} · B ${detail.counts.B} · C ${detail.counts.C}。${groupTestSummary(group)}`
        : `初學 ${detail.complete} / ${detail.total}；完成後可在同一組 Test。`,
      footer: `<div class="modal-actions"><button class="button-secondary" type="button" data-action="close-modal">關閉</button>${hasInitialLearning && relearningSource && !pausedSession && !isActiveGroup ? `<button class="button-secondary" type="button" data-action="start-group-relearning" data-group-id="${escapeHtml(group.id)}">重新初學</button>` : ""}<button class="button" type="button" data-action="${action}" data-group-id="${escapeHtml(group.id)}" ${pausedSession ? `data-session-id="${escapeHtml(pausedSession.id)}"` : ""}>${label}</button></div>`
    });
  }

  function openCurrentBatchModal() {
    const session = state.activeSession;
    if (!session) return;
    const isLearning = isLearningSession(session);
    const isRelearning = isRelearningSession(session);
    const wordIds = isLearning ? currentBatchWordIds(session) : testSessionWordIds(session);
    const group = session.groupId ? getStudyGroup(session.groupId) : null;
    const title = isLearning
      ? isRelearning ? `原第 ${session.sourceBatchNumber || session.batchNumber} 組 · 重新初學` : `第 ${session.batchNumber} 組單字`
      : session.scope === "review" ? "今日到期複習 · 本次單字" : `${session.groupLabel || (group ? studyGroupLabel(group) : "這組")} · Test 單字`;
    const subtitle = isLearning
      ? isRelearning
        ? `這組共有 ${wordIds.length} 個字；這次結果會另存，第一次的 A／B／C 不會被覆蓋。`
        : `這組共有 ${wordIds.length} 個字；三輪篩選不會改變本組清單。`
      : session.scope === "review"
        ? `本次共 ${wordIds.length} 個到期字；目前第 ${session.round || 1} 輪正在重測 ${session.queue.length} 字。`
        : `本組共 ${wordIds.length} 個字；目前第 ${session.round || 1} 輪正在重測 ${session.queue.length} 字。`;
    openBatchModal({
      title,
      wordIds,
      subtitle,
      responses: session.responses,
      difficultyMap: isRelearning ? relearningDifficulties(session) : null
    });
  }

  function openCompletedBatchModal() {
    const result = state.lastCompletion;
    if (!result?.wordIds) return;
    const isRelearning = result.type === "relearning";
    openBatchModal({
      title: isRelearning ? `原第 ${result.sourceBatchNumber || result.batchNumber} 組 · 重新初學` : `第 ${result.batchNumber} 組單字`,
      wordIds: result.wordIds,
      subtitle: isRelearning ? `本組 ${result.wordIds.length} 個字的重新初學紀錄。` : `本組 ${result.wordIds.length} 個字的初學紀錄。`,
      responses: result.responses,
      difficultyMap: isRelearning ? relearningDifficulties(result) : null
    });
  }

  function openCompletionDifficulty(difficulty) {
    const result = state.lastCompletion;
    if (!result?.wordIds) return;
    const isRelearning = result.type === "relearning";
    openBatchModal({
      title: isRelearning ? `原第 ${result.sourceBatchNumber || result.batchNumber} 組 · 重新初學 ${difficulty}` : `第 ${result.batchNumber} 組 · 初始難度 ${difficulty}`,
      wordIds: result.wordIds,
      subtitle: isRelearning ? `這些字在這次重新初學中的難度是 ${difficulty}。` : `這些字在本組 Learning 中的初始難度是 ${difficulty}。`,
      responses: result.responses,
      difficulty,
      difficultyMap: isRelearning ? relearningDifficulties(result) : null
    });
  }

  function openLearningHistory(unitId = state.ui.selectedUnitId) {
    const sessions = state.learningSessions.filter((session) => session.unitId === unitId);
    const relearningCount = state.relearningSessions.filter((session) => session.unitId === unitId).length;
    openModal(`
      <div class="modal-header"><div><h2>Learning 紀錄</h2><p class="body-copy">每一組的 20 個字與三輪作答都已保存；可查看後重新初學。${relearningCount ? `本單元另有 ${relearningCount} 次重新初學紀錄。` : ""}</p></div><button class="modal-close" type="button" data-action="close-modal">關閉</button></div>
      <section class="history-list modal-history-list">${sessions.length ? sessions.map((session) => {
        const attempts = state.relearningSessions.filter((item) => item.sourceLearningSessionId === session.id).length;
        return `<button class="history-row" type="button" data-action="open-learning-session" data-session-id="${escapeHtml(session.id)}"><b>第 ${session.batchNumber} 組</b><span>${dateTimeLabel(session.completedAt)}</span><span>A ${session.counts?.A || 0}　B ${session.counts?.B || 0}　C ${session.counts?.C || 0}${attempts ? `　·　已重新初學 ${attempts} 次` : ""}</span><i>查看／重新初學</i></button>`;
      }).join("") : `<div class="empty-history">尚未完成 Learning。</div>`}</section>`);
  }

  function openLearningSession(sessionId) {
    const session = state.learningSessions.find((item) => item.id === sessionId);
    if (!session) return;
    openBatchModal({
      title: `第 ${session.batchNumber} 組單字`,
      wordIds: wordIdsForLearningSession(session),
      subtitle: `完成於 ${dateTimeLabel(session.completedAt)}；重新初學會另外儲存，不會改寫第一次的 A／B／C。`,
      responses: session.responses || [],
      footer: `<div class="modal-actions"><button class="button-secondary" type="button" data-action="open-learning-history">回到 Learning 紀錄</button><button class="button" type="button" data-action="start-relearning" data-source-session-id="${escapeHtml(session.id)}">重新初學這組</button></div>`
    });
  }

  function openRelearningPicker(unitId = state.ui.selectedUnitId) {
    const sessions = state.learningSessions.filter((session) => session.unitId === unitId && wordIdsForLearningSession(session).length);
    openModal(`
      <div class="modal-header"><div><h2>重新初學</h2><p class="body-copy">選一組已完成 Learning 的 20 字重新跑三輪。結果會另存，不會覆蓋第一次 A／B／C、熟練度或 Test。</p></div><button class="modal-close" type="button" data-action="close-modal">關閉</button></div>
      <section class="history-list modal-history-list">${sessions.length ? sessions.map((session) => `<button class="history-row" type="button" data-action="start-relearning" data-source-session-id="${escapeHtml(session.id)}"><b>原第 ${session.batchNumber} 組</b><span>${dateTimeLabel(session.completedAt)}</span><span>${wordIdsForLearningSession(session).length} 字　·　A ${session.counts?.A || 0}　B ${session.counts?.B || 0}　C ${session.counts?.C || 0}</span><i>重新初學</i></button>`).join("") : `<div class="empty-history">尚未有已完成的 Learning 組別。</div>`}</section>`);
  }

  function openRelearningSession(sessionId) {
    const session = state.relearningSessions.find((item) => item.id === sessionId);
    if (!session) return;
    openBatchModal({
      title: `原第 ${session.sourceBatchNumber || "—"} 組 · 重新初學 #${session.relearningNumber || 1}`,
      wordIds: wordIdsForLearningSession(session),
      subtitle: `完成於 ${dateTimeLabel(session.completedAt)}；此紀錄不會影響原始 A／B／C 或熟練度。`,
      responses: session.responses || [],
      difficultyMap: relearningDifficulties(session)
    });
  }

  function openTestRecordModal(recordId) {
    const record = state.tests.find((item) => item.id === recordId);
    if (!record) return;
    const words = testSessionWordIds(record).map(findWord).filter(Boolean);
    const firstRoundMap = new Map(testRoundResponses(record, 1).map((response) => [response.wordId, response]));
    const known = words.filter((word) => firstRoundMap.get(word.id)?.known);
    const unknown = words.filter((word) => !firstRoundMap.get(word.id)?.known);
    const convergence = testConvergenceSummary(record);
    const score = convergence.firstScore;
    const rows = (items) => items.map((word) => {
      const firstResponse = firstRoundMap.get(word.id);
      const trail = (record.responses || []).filter((response) => response.wordId === word.id)
        .map((response) => `第 ${testResponseRound(response)} 輪 ${response.known ? "✓" : "✕"}`).join(" → ");
      return `<button class="modal-word-row" type="button" data-action="open-word-detail" data-word-id="${escapeHtml(word.id)}"><b>${escapeHtml(word.term)}</b><span>${escapeHtml(word.meaning)}</span><em class="${firstResponse?.known ? "result-known" : "result-unknown"}">${escapeHtml(trail || "—")}</em></button>`;
    }).join("") || `<p class="empty-history">—</p>`;
    const convergenceLabel = convergence.converged
      ? `第 ${convergence.roundCount} 輪收斂完成`
      : convergence.firstUnknown ? "舊版單輪紀錄" : "第 1 輪全對";
    openModal(`
      <div class="modal-header"><div><h2>${escapeHtml(recordLabel(record))}</h2><p class="body-copy">${dateTimeLabel(record.completedAt)}　·　第一輪會 ${known.length}、不會 ${unknown.length}　·　${score}%　·　${convergenceLabel}</p></div><button class="modal-close" type="button" data-action="close-modal">關閉</button></div>
      <section class="detail-result-columns">
        <div><h3>第一輪會 ${known.length}</h3><div class="modal-word-list">${rows(known)}</div></div>
        <div><h3>第一輪不會 ${unknown.length}</h3><div class="modal-word-list">${rows(unknown)}</div></div>
      </section>`);
  }

  function openLastTestResult() {
    const recordId = state.lastCompletion?.recordId;
    if (recordId) openTestRecordModal(recordId);
  }

  function openWordDetailModal(wordId) {
    const word = findWord(wordId);
    if (!word) return;
    const learningRounds = word.initialLearning?.rounds || [];
    const tests = testRecordsForWord(word.id).sort((a, b) => (a.completedAt || 0) - (b.completedAt || 0));
    const relearningRecords = relearningRecordsForWord(word.id).sort((a, b) => (a.completedAt || 0) - (b.completedAt || 0));
    const stats = historyStats(word);
    openModal(`
      <div class="modal-header"><div><h2>${escapeHtml(word.term)}</h2><p class="body-copy">${escapeHtml(word.meaning)}</p></div><button class="modal-close" type="button" data-action="close-modal">關閉</button></div>
      <section class="word-detail-grid">
        <div><small>初始學習</small><strong>${initialDifficultyLabel(word)}</strong><p>${learningRounds.length ? learningRounds.map((round) => `Round ${round.round} ${round.known ? "✓" : "✕"}`).join("　") : "尚未開始"}</p></div>
        <div><small>目前熟練度</small><strong>${masteryDetail(word)}</strong><p>${stats.total ? `最近 ${Math.min(5, stats.total)} 次正確率 ${stats.recentRate}%　·　連續答對 ${stats.streak} 次` : "尚未正式 Test"}</p></div>
      </section>
      <section class="word-test-history"><h3>Test History</h3>${tests.length ? `<ul>${tests.map((record) => {
        const responses = (record.responses || []).filter((item) => item.wordId === word.id);
        const firstResponse = responses.find((item) => testResponseRound(item) === 1) || responses[0];
        const trail = responses.map((item) => `第 ${testResponseRound(item)} 輪 ${item.known ? "✓" : "✕"}`).join(" → ");
        return `<li><button type="button" data-action="open-test-record" data-record-id="${escapeHtml(record.id)}"><span>${escapeHtml(recordLabel(record))}</span><span>${dateTimeLabel(record.completedAt)}</span><strong class="${firstResponse?.known ? "result-known" : "result-unknown"}">首輪 ${escapeHtml(trail || "—")}</strong></button></li>`;
      }).join("")}</ul>` : `<p class="empty-history">尚未正式 Test。</p>`}</section>
      <section class="word-test-history"><h3>重新初學紀錄</h3>${relearningRecords.length ? `<ul>${relearningRecords.map((record) => {
        const difficulty = relearningDifficulties(record)[word.id] || "—";
        return `<li><button type="button" data-action="open-relearning-session" data-session-id="${escapeHtml(record.id)}"><span>原第 ${record.sourceBatchNumber || "—"} 組 · 第 ${record.relearningNumber || 1} 次</span><span>${dateTimeLabel(record.completedAt)}</span><strong>新 ${escapeHtml(difficulty)}</strong></button></li>`;
      }).join("")}</ul>` : `<p class="empty-history">尚未重新初學。</p>`}</section>`);
  }

  function openModal(content) {
    modalRoot.innerHTML = `<div class="modal-backdrop" data-action="close-modal"><section class="modal" role="dialog" aria-modal="true" aria-label="資料管理">${content}</section></div>`;
  }

  function closeModal() { modalRoot.innerHTML = ""; }

  function openImportModal() {
    openModal(`
      <div class="modal-header"><div><h2>新增單元</h2><p class="body-copy">每行一筆：英文單字、中文意思。匯入後仍可保留你提供的全部延伸字。</p></div><button class="modal-close" type="button" data-action="close-modal">關閉</button></div>
      <label class="field-label" for="unit-name">單元名稱</label>
      <input class="field" id="unit-name" placeholder="例：Unit 2｜人際關係" />
      <label class="field-label" for="unit-words">單字內容</label>
      <textarea id="unit-words" placeholder="adverse, 不利的；負面的；有害的\nharmful, 有害的\nverse, 詩"></textarea>
      <p class="help">可用逗號、Tab 或中文逗號分隔。照片內容可先整理成這個格式再確認。</p>
      <div class="import-choice"><button class="button-secondary" type="button" data-action="open-file">從 CSV / TXT 匯入</button></div>
      <p class="notice" id="import-notice"></p>
      <div class="modal-actions"><button class="button-secondary" type="button" data-action="close-modal">取消</button><button class="button" type="button" data-action="save-unit">建立單元</button></div>`);
  }

  function openSettings() {
    openModal(`
      <div class="modal-header"><div><h2>資料與備份</h2><p class="body-copy">所有作答會立即寫入這台裝置的瀏覽器資料庫。</p></div><button class="modal-close" type="button" data-action="close-modal">關閉</button></div>
      <div class="settings-row"><div><h3>新增 Unit</h3><p>以文字、CSV 或 TXT 建立新的單元；每個 Unit 都會自動分組。</p></div><button class="button-secondary" type="button" data-action="open-import">新增 Unit</button></div>
      <div class="settings-row"><div><h3>匯出備份</h3><p>下載完整單字、Learning 與 Test 紀錄。換裝置前請先匯出。</p></div><button class="button-secondary" type="button" data-action="export-backup">匯出 JSON</button></div>
      <div class="settings-row"><div><h3>匯入備份</h3><p>會以備份檔取代此裝置目前的資料。</p></div><button class="button-secondary" type="button" data-action="restore-backup">匯入 JSON</button></div>
      <div class="divider"></div><p class="help">目前共有 ${state.units.length} 個單元、${state.words.length} 個學習項目、${state.tests.length} 筆 Test、${state.relearningSessions.length} 筆重新初學紀錄。</p>`);
  }

  function parseWordLines(text) {
    return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
      const pieces = line.split(/\t|，|,/).map((piece) => piece.trim()).filter(Boolean);
      return { term: pieces.shift(), meaning: pieces.join("；") };
    }).filter((item) => item.term && item.meaning);
  }

  async function addUnitFromText(name, text) {
    const parsed = parseWordLines(text);
    if (!name.trim() || !parsed.length) return { ok: false, message: "請填寫單元名稱，並至少輸入一筆「英文單字、中文意思」。" };
    const unit = { id: uid(), bookId: currentBookId() || state.books?.[0]?.id || "ios-default-book", name: name.trim(), createdAt: now(), note: "手動匯入", source: "文字／CSV" };
    const seen = new Set();
    const words = parsed.filter((item) => {
      const key = item.term.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map((item) => ({ ...entry(item.term, item.meaning, "主字", item.term), unitId: unit.id }));
    const studyGroups = makeStudyGroups(unit.id, words.map((word) => word.id));
    await commit((draft) => {
      draft.units.push(unit);
      draft.words.push(...words);
      draft.studyGroups ||= [];
      draft.studyGroups.push(...studyGroups);
      draft.ui.selectedBookId = unit.bookId;
      draft.ui.selectedUnitId = unit.id;
    });
    return { ok: true };
  }

  async function importTextFile(file) {
    const text = await file.text();
    const name = file.name.replace(/\.[^.]+$/, "");
    const result = await addUnitFromText(name, text);
    if (!result.ok) alert(result.message);
    else closeModal();
  }

  function exportBackup() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `記住2027-備份-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function restoreBackup(file) {
    try {
      const restored = JSON.parse(await file.text());
      if (!restored || typeof restored !== "object" || !Array.isArray(restored.units) || !Array.isArray(restored.words) || !Array.isArray(restored.tests)) throw new Error("invalid");
      if (!window.confirm("匯入後會取代這台裝置目前的資料。確定要繼續嗎？")) return;
      const wordIds = new Set(restored.words.map((word) => word?.id).filter(Boolean));
      const activeSession = restored.activeSession;
      const validActiveSession = !activeSession || (
        ["learning", "relearning", "test"].includes(activeSession.type) &&
        Array.isArray(activeSession.queue) &&
        activeSession.queue.length > 0 &&
        Number.isInteger(activeSession.index) &&
        activeSession.index >= 0 &&
        activeSession.index < activeSession.queue.length &&
        activeSession.queue.every((wordId) => wordIds.has(wordId))
      );
      state = restored;
      state.learningSessions = Array.isArray(state.learningSessions) ? state.learningSessions : [];
      state.relearningSessions = Array.isArray(state.relearningSessions) ? state.relearningSessions : [];
      migrateState(state);
      if (!validActiveSession) state.activeSession = null;
      state.ui = {
        ...(state.ui || {}),
        view: state.activeSession ? (isLearningSession(state.activeSession) ? "learning" : "test") : "home",
        selectedUnitId: state.ui?.selectedUnitId || state.units[0]?.id,
        tab: ["overview", "practice", "library", "tests"].includes(state.ui?.tab) ? state.ui.tab : "overview"
      };
      await storeState(state);
      closeModal();
      render();
    } catch {
      alert("這不是有效的備份檔案。請選擇由本網站匯出的 JSON 檔。\n");
    }
  }

  document.addEventListener("click", async (event) => {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const action = target.dataset.action;
    if (action === "close-modal") {
      if (target.tagName === "BUTTON" || event.target === target) closeModal();
      return;
    }
    if (action === "go-home") { await commit((draft) => { draft.ui.view = "home"; draft.ui.tab = "overview"; }); return; }
    if (action === "open-import") { openImportModal(); return; }
    if (action === "open-settings") { openSettings(); return; }
    if (action === "open-current-batch") { openCurrentBatchModal(); return; }
    if (action === "open-completed-batch") { openCompletedBatchModal(); return; }
    if (action === "open-completion-difficulty") { openCompletionDifficulty(target.dataset.difficulty); return; }
    if (action === "open-learning-history") { openLearningHistory(); return; }
    if (action === "open-learning-session") { openLearningSession(target.dataset.sessionId); return; }
    if (action === "open-relearning-picker") { openRelearningPicker(); return; }
    if (action === "open-relearning-session") { openRelearningSession(target.dataset.sessionId); return; }
    if (action === "open-test-record") { openTestRecordModal(target.dataset.recordId); return; }
    if (action === "open-last-test-result") { openLastTestResult(); return; }
    if (action === "open-study-group") { openStudyGroupModal(target.dataset.groupId); return; }
    if (action === "open-word-detail") { openWordDetailModal(target.dataset.wordId); return; }
    if (action === "select-tab") {
      await commit((draft) => { draft.ui.tab = target.dataset.tab; });
      return;
    }
    if (action === "open-unit-practice") {
      const unit = getUnit(target.dataset.unitId);
      if (!unit) return;
      await commit((draft) => { draft.ui.view = "home"; draft.ui.selectedUnitId = unit.id; draft.ui.tab = "practice"; });
      return;
    }
    if (action === "open-file") { fileInput.click(); return; }
    if (action === "export-backup") { exportBackup(); return; }
    if (action === "restore-backup") { restoreInput.click(); return; }
    if (action === "save-unit") {
      const name = document.getElementById("unit-name").value;
      const words = document.getElementById("unit-words").value;
      const result = await addUnitFromText(name, words);
      if (result.ok) closeModal();
      else document.getElementById("import-notice").textContent = result.message;
      return;
    }
    if (action === "select-card-unit") {
      await commit((draft) => { draft.ui.selectedUnitId = target.dataset.unitId; });
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (action === "start-learning") {
      await commit((draft) => startLearning(draft.ui.selectedUnitId));
      return;
    }
    if (action === "start-group-learning") {
      const group = getStudyGroup(target.dataset.groupId);
      if (!group) return;
      closeModal();
      await commit(() => startLearning(group.unitId, group.id));
      return;
    }
    if (action === "start-group-test") {
      const groupId = target.dataset.groupId;
      if (!groupId) return;
      closeModal();
      await commit(() => startGroupTest(groupId));
      return;
    }
    if (action === "resume-paused-session") {
      const sessionId = target.dataset.sessionId;
      if (!sessionId) return;
      closeModal();
      await commit(() => resumePausedSession(sessionId));
      return;
    }
    if (action === "start-group-relearning") {
      const group = getStudyGroup(target.dataset.groupId);
      const sourceSession = completedLearningSessionForGroup(group);
      if (!group || !sourceSession) return;
      closeModal();
      await commit(() => startRelearning(sourceSession.id));
      return;
    }
    if (action === "start-relearning") {
      const sourceSessionId = target.dataset.sourceSessionId;
      if (!sourceSessionId) return;
      closeModal();
      await commit(() => startRelearning(sourceSessionId));
      return;
    }
    if (action === "start-unit-test") {
      await commit((draft) => startTest(draft.ui.selectedUnitId, "unit"));
      return;
    }
    if (action === "start-random-test") {
      await commit((draft) => startTest(draft.ui.selectedUnitId, "random"));
      return;
    }
    if (action === "start-review") {
      await commit(() => startReview());
      return;
    }
    if (action === "resume-session") {
      closeModal();
      await commit((draft) => { draft.ui.view = isLearningSession(draft.activeSession) ? "learning" : "test"; });
      return;
    }
    if (action === "flip-card") {
      await commit((draft) => { if (draft.activeSession) draft.activeSession.flipped = !draft.activeSession.flipped; });
      return;
    }
    if (action === "answer") {
      const known = target.dataset.known === "true";
      await commit(() => {
        if (state.activeSession?.type === "learning") answerLearning(known);
        else if (state.activeSession?.type === "relearning") answerRelearning(known);
        else if (state.activeSession?.type === "test") answerTest(known);
      });
    }
  });

  document.addEventListener("change", async (event) => {
    const target = event.target;
    if (target.matches('[data-action="select-book"]')) {
      await commit((draft) => {
        draft.ui.selectedBookId = target.value;
        const firstUnit = draft.units.find((unit) => (unit.bookId || draft.books?.[0]?.id) === target.value);
        if (firstUnit) draft.ui.selectedUnitId = firstUnit.id;
      });
      return;
    }
    if (target.matches('[data-action="select-unit"]')) {
      await commit((draft) => { draft.ui.selectedUnitId = target.value; });
    }
  });
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (file) await importTextFile(file);
    fileInput.value = "";
  });
  restoreInput.addEventListener("change", async () => {
    const file = restoreInput.files?.[0];
    if (file) await restoreBackup(file);
    restoreInput.value = "";
  });

  function reconcileStudyGroups(draft) {
    const previousGroups = Array.isArray(draft.studyGroups) ? draft.studyGroups : [];
    const nextGroups = [];

    for (const unit of draft.units || []) {
      const validWordIds = new Set((draft.words || []).filter((word) => word.unitId === unit.id).map((word) => word.id));
      const assigned = new Set();
      const canonical = [];
      const existing = previousGroups
        .filter((group) => group.unitId === unit.id)
        .sort((left, right) => (left.groupNumber || 0) - (right.groupNumber || 0) || (left.createdAt || 0) - (right.createdAt || 0));

      for (const group of existing) {
        const wordIds = groupWordIds(group).filter((wordId) => validWordIds.has(wordId) && !assigned.has(wordId));
        if (!wordIds.length) continue;
        wordIds.forEach((wordId) => assigned.add(wordId));
        canonical.push({ ...group, unitId: unit.id, wordIds, createdAt: group.createdAt || unit.createdAt || now() });
      }

      // Old versions did not have fixed groups. Preserve completed or active
      // Learning batches first, then randomize only the remaining words.
      if (!canonical.length) {
        const historicalSessions = [
          ...(draft.learningSessions || []).filter((session) => session.unitId === unit.id && session.completedAt),
          ...((draft.activeSession?.type === "learning" && draft.activeSession.unitId === unit.id) ? [draft.activeSession] : [])
        ].sort((left, right) => (left.batchNumber || 0) - (right.batchNumber || 0) || (left.startedAt || 0) - (right.startedAt || 0));
        for (const session of historicalSessions) {
          const wordIds = storedSessionWordIds(session).filter((wordId) => validWordIds.has(wordId));
          if (!wordIds.length || wordIds.length > 20 || wordIds.some((wordId) => assigned.has(wordId))) continue;
          wordIds.forEach((wordId) => assigned.add(wordId));
          canonical.push(createStudyGroup(unit.id, wordIds, canonical.length + 1, session.startedAt || unit.createdAt || now()));
        }
      }

      const remaining = [...validWordIds].filter((wordId) => !assigned.has(wordId));
      canonical.push(...makeStudyGroups(unit.id, remaining, canonical.length + 1));
      canonical.forEach((group, index) => { group.groupNumber = index + 1; });
      nextGroups.push(...canonical);
    }

    const unchanged = previousGroups.length === nextGroups.length && previousGroups.every((group, index) => {
      const next = nextGroups[index];
      return next && group.id === next.id && group.unitId === next.unitId && group.groupNumber === next.groupNumber && sameWordSet(groupWordIds(group), groupWordIds(next));
    });
    draft.studyGroups = nextGroups;
    return !unchanged;
  }

  function linkStudyGroupHistory(draft) {
    let changed = false;
    const groups = draft.studyGroups || [];
    const groupsById = new Map(groups.map((group) => [group.id, group]));
    const resolve = (entry) => {
      if (!entry) return null;
      if (entry.groupId && groupsById.has(entry.groupId)) return groupsById.get(entry.groupId);
      return findStudyGroupByWordIds(groups, entry.unitId, storedSessionWordIds(entry));
    };
    const attach = (entry, group) => {
      if (!entry || !group) return;
      if (entry.groupId !== group.id) { entry.groupId = group.id; changed = true; }
      if (entry.type === "test" || entry.scope === "group") {
        const label = studyGroupLabel(group);
        if (entry.groupLabel !== label) { entry.groupLabel = label; changed = true; }
      }
    };

    for (const session of draft.learningSessions || []) attach(session, resolve(session));
    const learningById = new Map((draft.learningSessions || []).map((session) => [session.id, session]));
    for (const session of draft.relearningSessions || []) {
      const source = learningById.get(session.sourceLearningSessionId);
      attach(session, source ? resolve(source) : resolve(session));
    }
    for (const record of draft.tests || []) attach(record, resolve(record));
    if (draft.activeSession) {
      const activeSource = draft.activeSession.type === "relearning"
        ? learningById.get(draft.activeSession.sourceLearningSessionId)
        : draft.activeSession;
      attach(draft.activeSession, activeSource ? resolve(activeSource) : resolve(draft.activeSession));
    }
    for (const session of draft.pausedSessions || []) {
      const pausedSource = session.type === "relearning"
        ? learningById.get(session.sourceLearningSessionId)
        : session;
      attach(session, pausedSource ? resolve(pausedSource) : resolve(session));
    }
    if (draft.lastCompletion?.unitId) attach(draft.lastCompletion, resolve(draft.lastCompletion));
    return changed;
  }

  function hasUnitProgress(draft, unitId) {
    const unitWords = (draft.words || []).filter((word) => word.unitId === unitId);
    const unitWordIds = new Set(unitWords.map((word) => word.id));
    return unitWords.some((word) => word.initialDifficulty)
      || (draft.tests || []).some((record) => record.unitId === unitId || record.responses?.some((response) => unitWordIds.has(response.wordId)))
      || (draft.learningSessions || []).some((session) => session.unitId === unitId)
      || (draft.relearningSessions || []).some((session) => session.unitId === unitId)
      || (draft.pausedSessions || []).some((session) => session.unitId === unitId)
      || draft.activeSession?.unitId === unitId;
  }

  function ensureTextbookUnit(draft, number, title, wordsBuilder) {
    const prefix = new RegExp(`^Unit ${number}(?:\\s|·|$)`);
    const expectedName = `Unit ${number} · ${title}`;
    let unit = (draft.units || []).find((candidate) => candidate.source === "課本照片" && prefix.test(candidate.name));
    const incomingWords = wordsBuilder();

    if (!unit) {
      unit = {
        id: uid(),
        name: expectedName,
        createdAt: now(),
        note: "主字、字族、近義字、形近字與搭配用法",
        source: "課本照片"
      };
      draft.units.push(unit);
      draft.words.push(...incomingWords.map((word) => ({ ...word, unitId: unit.id })));
      return true;
    }

    const existingWords = (draft.words || []).filter((word) => word.unitId === unit.id);
    if (!hasUnitProgress(draft, unit.id) && existingWords.length !== incomingWords.length) {
      draft.words = draft.words.filter((word) => word.unitId !== unit.id);
      draft.words.push(...incomingWords.map((word) => ({ ...word, unitId: unit.id })));
      unit.name = expectedName;
      unit.note = "主字、字族、近義字、形近字與搭配用法";
      return true;
    }
    return false;
  }

  function ensureImportedTextbookUnits(draft) {
    const unitTwoChanged = ensureTextbookUnit(draft, 2, "情緒與感覺（2）", buildUnitTwoWords);
    const unitThreeChanged = ensureTextbookUnit(draft, 3, "情緒與感覺（3）", buildUnitThreeWords);
    return unitTwoChanged || unitThreeChanged;
  }

  function firstRoundResponsesByWord(record) {
    const responses = new Map();
    for (const response of record?.responses || []) {
      if (testResponseRound(response) !== 1 || responses.has(response.wordId)) continue;
      responses.set(response.wordId, response);
    }
    return responses;
  }

  function migrateMasteryModelV2(draft) {
    const words = draft.words || [];
    const needsMigration = words.some((word) => word.initialDifficulty && word.mastery?.modelVersion !== 2);
    if (!needsMigration) return false;

    const wordsById = new Map(words.map((word) => [word.id, word]));
    for (const word of words) {
      if (!word.initialDifficulty) continue;
      word.mastery = createInitialMastery(word, word.initialLearning?.completedAt || word.createdAt || now());
    }

    // Replay only a Test's first answer for each word.  This preserves the
    // original Test history but removes the old behaviour where convergence
    // rounds could alter mastery more than once.
    for (const record of [...(draft.tests || [])].sort((a, b) => (a.completedAt || a.startedAt || 0) - (b.completedAt || b.startedAt || 0))) {
      for (const [wordId, response] of firstRoundResponsesByWord(record)) {
        const word = wordsById.get(wordId);
        if (!word?.initialDifficulty) continue;
        applyTestResult(word, response.known, response.at || record.completedAt || record.startedAt || now());
      }
    }
    return true;
  }

  function migrateState(draft) {
    let changed = false;
    const previousVersion = draft.version || 0;
    if (!Array.isArray(draft.books) || !draft.books.length) {
      draft.books = [{ id: "ios-default-book", name: "進階英單" }];
      changed = true;
    }
    const fallbackBookId = draft.books[0].id;
    for (const unit of draft.units || []) {
      if (!unit.bookId) { unit.bookId = fallbackBookId; changed = true; }
    }
    if (!Array.isArray(draft.units)) { draft.units = []; changed = true; }
    if (!Array.isArray(draft.words)) { draft.words = []; changed = true; }
    if (!Array.isArray(draft.tests)) { draft.tests = []; changed = true; }
    if (!Array.isArray(draft.learningSessions)) { draft.learningSessions = []; changed = true; }
    if (!Array.isArray(draft.relearningSessions)) { draft.relearningSessions = []; changed = true; }
    if (!Array.isArray(draft.pausedSessions)) { draft.pausedSessions = []; changed = true; }
    if (!Array.isArray(draft.studyGroups)) { draft.studyGroups = []; changed = true; }
    if (!draft.ui) { draft.ui = { view: "home", selectedBookId: fallbackBookId, selectedUnitId: draft.units?.[0]?.id, tab: "overview" }; changed = true; }
    if (!draft.ui.selectedBookId || !draft.books.some((book) => book.id === draft.ui.selectedBookId)) {
      const selectedUnit = draft.units.find((unit) => unit.id === draft.ui.selectedUnitId);
      draft.ui.selectedBookId = selectedUnit?.bookId || fallbackBookId;
      changed = true;
    }
    const unitIds = new Set((draft.units || []).map((unit) => unit.id));
    const fallbackUnitId = draft.units?.find((unit) => unit.bookId === draft.ui.selectedBookId)?.id || draft.units?.[0]?.id || null;
    const selectedUnit = draft.units.find((unit) => unit.id === draft.ui.selectedUnitId);
    if (fallbackUnitId && (!unitIds.has(draft.ui.selectedUnitId) || selectedUnit?.bookId !== draft.ui.selectedBookId)) { draft.ui.selectedUnitId = fallbackUnitId; changed = true; }
    if (!["overview", "practice", "library", "tests"].includes(draft.ui.tab)) { draft.ui.tab = "overview"; changed = true; }
    if ((draft.version || 0) < 9 && draft.ui.tab !== "overview") { draft.ui.tab = "overview"; changed = true; }

    if (isLearningSession(draft.activeSession) && !draft.activeSession.batchWordIds?.length) {
      draft.activeSession.batchWordIds = unique([...(draft.activeSession.queue || []), ...(draft.activeSession.responses || []).map((response) => response.wordId)]);
      changed = true;
    }
    if (draft.activeSession?.type === "relearning") {
      const activeDifficulties = draft.activeSession.relearningDifficulties || draft.activeSession.difficulties || draft.activeSession.wordDifficulties || {};
      if (draft.activeSession.relearningDifficulties !== activeDifficulties) {
        draft.activeSession.relearningDifficulties = activeDifficulties;
        changed = true;
      }
      if (!draft.activeSession.sourceLearningSessionId && draft.activeSession.sourceSessionId) {
        draft.activeSession.sourceLearningSessionId = draft.activeSession.sourceSessionId;
        changed = true;
      }
    }
    if (draft.activeSession?.type === "test") {
      const activeTest = draft.activeSession;
      if (!Number.isInteger(activeTest.round) || activeTest.round < 1) {
        activeTest.round = 1;
        changed = true;
      }
      if (!activeTest.wordIds?.length) {
        activeTest.wordIds = unique([...(activeTest.queue || []), ...(activeTest.responses || []).map((response) => response.wordId)]);
        changed = true;
      }
      if (!activeTest.batchWordIds?.length) {
        activeTest.batchWordIds = [...activeTest.wordIds];
        changed = true;
      }
      if (!Array.isArray(activeTest.rounds)) {
        activeTest.rounds = [];
        changed = true;
      }
      for (const response of activeTest.responses || []) {
        if (!Number.isInteger(response.round) || response.round < 1) {
          response.round = 1;
          changed = true;
        }
      }
    }

    for (const session of draft.learningSessions) {
      if (!session.wordIds?.length) {
        session.wordIds = unique((session.responses || []).map((response) => response.wordId));
        changed = true;
      }
    }

    const learningSessionsById = new Map(draft.learningSessions.map((session) => [session.id, session]));
    const relearningNumbers = new Map();
    for (const session of [...draft.relearningSessions].sort((a, b) => (a.completedAt || a.startedAt || 0) - (b.completedAt || b.startedAt || 0))) {
      if (!session.wordIds?.length) {
        session.wordIds = unique((session.responses || []).map((response) => response.wordId));
        changed = true;
      }
      const difficulties = session.difficulties || session.wordDifficulties || session.relearningDifficulties || {};
      if (session.difficulties !== difficulties) {
        session.difficulties = difficulties;
        changed = true;
      }
      if (!session.sourceLearningSessionId && session.sourceSessionId) {
        session.sourceLearningSessionId = session.sourceSessionId;
        changed = true;
      }
      const source = learningSessionsById.get(session.sourceLearningSessionId);
      if (!session.sourceBatchNumber && source?.batchNumber) {
        session.sourceBatchNumber = source.batchNumber;
        changed = true;
      }
      if (!session.sourceCompletedAt && source?.completedAt) {
        session.sourceCompletedAt = source.completedAt;
        changed = true;
      }
      const numberKey = session.sourceLearningSessionId || `${session.unitId || "unknown"}:${session.sourceBatchNumber || "unknown"}`;
      const nextNumber = (relearningNumbers.get(numberKey) || 0) + 1;
      relearningNumbers.set(numberKey, nextNumber);
      if (!session.relearningNumber) {
        session.relearningNumber = nextNumber;
        changed = true;
      } else {
        relearningNumbers.set(numberKey, Math.max(relearningNumbers.get(numberKey), session.relearningNumber));
      }
    }

    if (draft.lastCompletion?.type === "relearning" && !draft.lastCompletion.difficulties) {
      draft.lastCompletion.difficulties = draft.lastCompletion.wordDifficulties || draft.lastCompletion.relearningDifficulties || {};
      changed = true;
    }

    const testNumbers = new Map();
    for (const record of [...draft.tests].sort((a, b) => (a.completedAt || 0) - (b.completedAt || 0))) {
      if (!record.wordIds?.length) { record.wordIds = unique((record.responses || []).map((response) => response.wordId)); changed = true; }
      if (!Array.isArray(record.rounds)) { record.rounds = []; changed = true; }
      for (const response of record.responses || []) {
        if (!Number.isInteger(response.round) || response.round < 1) {
          response.round = 1;
          changed = true;
        }
      }
      if (record.scope !== "review" && !record.testNumber) {
        const nextNumber = (testNumbers.get(record.unitId) || 0) + 1;
        testNumbers.set(record.unitId, nextNumber);
        record.testNumber = nextNumber;
        record.scopeLabel = record.scopeLabel?.startsWith("Test #") ? record.scopeLabel : `Test #${nextNumber} · ${record.scopeLabel || "Test"}`;
        changed = true;
      } else if (record.scope !== "review") {
        testNumbers.set(record.unitId, Math.max(testNumbers.get(record.unitId) || 0, record.testNumber));
      }
    }

    if (migrateMasteryModelV2(draft)) changed = true;

    const defaultUnit = (draft.units || []).find((unit) => unit.source === "課本照片" && /^Unit 1/.test(unit.name));
    if (defaultUnit) {
      const defaultWords = (draft.words || []).filter((word) => word.unitId === defaultUnit.id);
      const correctedWords = buildUnitOneWords();
      if (!hasUnitProgress(draft, defaultUnit.id) && defaultWords.length !== correctedWords.length) {
        draft.words = draft.words.filter((word) => word.unitId !== defaultUnit.id);
        draft.words.push(...correctedWords.map((word) => ({ ...word, unitId: defaultUnit.id })));
        defaultUnit.name = "Unit 1 · 情緒與感覺（1）";
        changed = true;
      }
    }

    if (ensureImportedTextbookUnits(draft)) changed = true;

    if (reconcileStudyGroups(draft)) changed = true;
    if (linkStudyGroupHistory(draft)) changed = true;

    if (previousVersion < 11) {
      for (const word of draft.words || []) {
        if (!word.initialDifficulty || !word.mastery) continue;
        const stage = masteryStage(word);
        const anchor = word.initialLearning?.completedAt || word.mastery.lastScoredAt || word.createdAt || now();
        word.mastery.nextDueAt = anchor + masteryGapAfterStage(word, stage) * DAY;
        changed = true;
      }
    }

    if (draft.version !== APP_STATE_VERSION) { draft.version = APP_STATE_VERSION; changed = true; }
    return changed;
  }

  async function init() {
    try {
      state = await readStoredState();
      if (!state) {
        state = defaultState();
        await storeState(state);
      }
      if (migrateState(state)) await storeState(state);
      render();
    } catch (error) {
      app.innerHTML = `<section class="empty-panel"><h2>無法開啟本機資料庫</h2><p class="body-copy">請使用一般瀏覽器開啟此網站，並允許網站儲存資料後再試一次。</p></section>`;
      console.error(error);
    }
  }

  init();
})();
