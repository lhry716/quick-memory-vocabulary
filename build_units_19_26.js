const fs = require('fs');

const source = '/Users/lhry716/Downloads/快速記憶法備份.json';
const output = '/Users/lhry716/Documents/快速記憶法/快速記憶法備份_Unit19-26_已匯入.json';
const db = JSON.parse(fs.readFileSync(source, 'utf8'));
const now = Date.now();

// 格式：單元|主字|中文釋義|搭配用法（以 ; 分隔）|近義字（以 ; 分隔）|形近字（以 ; 分隔）
// 本表依使用者提供的課本照片逐項轉錄；所有關聯項都會變成可複習的獨立詞條。
const rows = String.raw`
19|allergy|過敏|be allergic to|sensitivity|alleviate;alley;allegory;allegedly;gallery
19|antibiotic|抗生素|a course of antibiotics|medication;remedy;treatment|antibody;anticlockwise;antics;antidote
19|artery|動脈|arteries|vessel;vein;capillary|artful;article;artifact;artifice;artificial
19|bruise|瘀傷；擦傷；使受瘀傷|black-and-blue mark|injury;swelling|cruise
19|caffeine|咖啡因|drinks containing caffeine| |coffee;café;decaffeinated;cafeteria
19|calm|鎮定的；使鎮定；平靜|keep calm|composed;collected;tranquil|clam;clumsy;palm;psalm
19|capsule|膠囊；小容器|time capsule|pod;case;vessel;shell|cap;caption;captive;capsize;cappuccino
19|checkup|健康檢查；檢查；核對|physical examination| |check;checkered;checkers;check-in;checkout;checkmate
19|cholesterol|膽固醇|bad cholesterol level| |cholera;steroid;asteroid;stereo
19|chronic|慢性的；久病的；長期的|chronic disease|persistent;constant;continual|chronicle;chromosome
19|clinic|診所；會診；臨床講授|clinical trials| |cling;clip;clipping
19|complexion|面色；膚色；氣色；性質| |skin;hue|complex;complication;complicated
19|compulsory|必須做的；強制性的；必修的|compulsory education|obligatory;mandatory;required|compulsive;compel
19|contagious|接觸傳染的；感染性的；會蔓延的| |infectious;catching;transmissible|contact;tangible;tangent
19|contaminate|污染；毒害| |pollute;corrupt;taint;infect;spoil|contempt
19|disable|使傷殘；使喪失能力|physically disabled|handicap;cripple;damage;impair;paralyze|capable
19|dose|一劑；劑量；按劑量給藥|a lethal dose|drug;injection;potion|nosy;hose;pose

20|cosmetic|化妝的；化妝品的；整容的；裝飾性的|cosmetic surgery|superficial|cosmopolitan;costume;cozy;cosmos;custom
20|countless|無數的；數不盡的| |innumerable;infinite;incalculable|account;accountant;encounter;counter;countdown;county
20|cradle|搖籃；發源地|from cradle to grave|crib;origin;source;fountainhead|cracker;cram;cramp;candle;crackdown
20|detergent|洗滌劑；洗衣粉| |cleanser|divergent;urgent;deter;deteriorate;diligent
20|diagnose|診斷；判斷|diagnose someone with something;diagnose someone as having something|identify;analyze|diagram;dialect;dialogue
20|emerge|出現；浮現|It emerged that ...|appear;surface;come into view|emergency;merge;submerge;verge
20|environment|環境；四周狀況|working environment;learning environment|surroundings;atmosphere;background;habitat;situation|envelope
20|epidemic|流行病；時疫| |plague|academic;endemic;pandemic;demo;demon
20|exposure|暴露；曝光；揭露| |publicity;revelation|explosion;exposition
20|extent|程度；限度；寬度；長度|to some extent|amount;breadth;length;stretch;volume;width|tent;extensive;intensive;external;extant
20|extinct|絕種的；熄滅的| |gone;lost;vanished|extent;exterior
20|faint|微弱的；暗淡的；暈倒| |dim;vague;slight;exhausted|fair;fairy;faith
20|fertile|繁殖力強的；肥沃的；多產的|a fertile imagination|rich;fruitful;plentiful;productive;prolific|ferment;ferry;fervent
20|gender|性；性別|gender equality;gender discrimination|sex|gene;generous;genealogy;genetics
20|handicap|妨礙；使不利；障礙| |restrict;burden|cap;handle;handicraft;handkerchief
20|herb|草本植物；藥草|herbal medicine|plant;vegetation|herbivorous;herd

21|heredity|遺傳| |genetics;inheritance|adhere;inherent;coherent;heritage
21|hospitalize|使住院治療|be admitted to hospital| |hose;hospitable;host;hostel;hostile;hostage
21|immunity|免疫；免疫力|immunity from|resistance;protection|community;commute
21|infect|傳染；感染；使受影響；污染|be infected with|contaminate;communicate;pollute|affect;defect;effect;perfect;confection;infest
21|influenza|流行性感冒|a flu epidemic| |influence;fluent;fluency;influx;flow;affluent;fluctuate
21|inject|注射；投入；注入| |vaccinate;insert;shoot;instill|injection
21|injury|傷害；損害|the injured party|harm;damage;trauma;wound|injudicious;jury
21|insane|精神病的；瘋狂的；極愚蠢的| |mad;crazed;crazy;idiotic;mentally ill;out of one's mind|sane;saint;sanitary
21|internal|內部的；國內的| |inner;interior;inside;domestic|intern;external;maternal;paternal;eternal
21|mental|精神的；心理的|mental illness|intellectual|sentimental;elemental;fundamental;detrimental;monumental
21|mortality|死亡數字；死亡率；必死性| |death|immortality;morality
21|muscle|肌肉；體力|not move a muscle|strength;power;might|muse;muster;museum
21|nervous|緊張的；神經質的|nervous breakdown;be nervous about|anxious;edgy;tense;uneasy|nerve;nerd;grievous
21|nourish|養育；滋養；懷抱|nourishing food|nurture|nought;nursery;nutrient;nutrition;flourish
21|obsess|使著迷；使困擾；使牽掛|be obsessed by/with|preoccupy;haunt;torment|assess;possess;access
21|optimistic|樂觀的| |confident;positive;sanguine|opt;optional;optical;mystic
21|paralysis|癱瘓；麻痺；停頓| |immobility;standstill;breakdown|analysis;parachute;parade;paradigm;paradise;paradox;paragraph
21|pharmacy|藥房；藥劑學| |drugstore|phantom;pharaoh;phase;phenomenon

22|pregnant|懷孕的| |productive;expectant|precedent;prevalent;segment
22|recover|恢復；康復；挽回|recover consciousness|heal;improve|cover;uncover;discover;hover
22|resistance|抵抗；抵抗力；抵制| |obstruction;opposition|assistance;persistence;insistence
22|safety|安全| |security;protection;shelter;refuge|saga;sage;saint;sanity
22|sanitation|公共衛生；衛生設施|environmental sanitation|hygiene|sanity;sanction;saturation
22|skeleton|骨骼；骨架；大綱|a skeleton in the closet|bone;framework|simpleton
22|sneeze|打噴嚏；噴嚏聲| | |sneer;snooze;snore;snob;sneaky;sneaker;sniff
22|spine|脊椎|send shivers down someone's spine|backbone;spinal cord|spin;spice;spike;spiral;spirit;spit
22|sprain|扭傷（關節）；扭傷| |strain;twist|spring;sprint;spray;span
22|symptom|症狀| |indication;token;implication;sign|symposium;symphony;sympathize;syndrome
22|therapy|治療；療法|alternative therapies|remedy;cure;treatment|thermal;theme
22|vaccinate|給……注射疫苗|vaccinate someone against something|immunize|vacuum;vacation;vacancy
22|vigorous|精力充沛的；健壯的；強而有力的| |energetic;fit;dynamic;spirited|vicarious;victorious;vinegar
22|virus|病毒|computer virus|bacteria;bug;germ|virtuous;virulent;virtual;virtue;virtuoso
22|vomit|嘔吐；嘔吐物|throw up|spew|omit;admit;emit;permit;hermit;limit;submit;transmit
22|yoga|瑜伽| | |yoke;yolk;yogurt

23|accustom|使習慣於；使適應|be accustomed to (doing) something|adapt;familiarize;acclimatize|accuse;custom
23|alter|改變| |modify|alternative;alternate;altercation;altruism
23|altitude|高度；海拔|high/low altitudes|height|latitude;longitude;attitude;aptitude;gratitude
23|Antarctic|南極地區；南極的| |the South Pole|Arctic
23|antenna|天線；觸角；觸鬚| |aerial|ant;antecedent;anterior;anthem;anthology;anti-
23|balance|平衡；均衡；使平衡|keep a balance between A and B|stability;composure;equilibrium;symmetry|lance;balcony
23|barren|不育的；不結果實的；荒蕪的| |infertile;unproductive;arid;deserted|bar;barrier;barter
23|blossom|開花；生長茂盛；花|in full blossom|bloom;flourish;prosper;thrive|blood;blot;blouse
23|breed|品種；種類；繁殖；培育| |variety;pedigree;race;species;stock;strain|reed;bead;breathe;brevity;brew
23|comet|彗星| |meteorite;shooting star|coma;comma;karma;comely;comedy;comic
23|consequence|結果；後果；重要性；推論|take the consequences;in consequence of|result;outcome;effect|sequence;sequel;consecutive;prosecute;persecute
23|conservation|保存；保護|conservation area|protection;preservation|serve;severe;sever;constipation
23|creature|生物；動物| |beast|feature;amateur;caricature
23|crystal|水晶；結晶；水晶的| | |critical;pistol
23|demolish|毀壞；破壞| |destroy;annihilate|demo;demon;abolish
23|depletion|消耗；用盡| |consumption;exhaustion;completion|deplete
23|glacier|冰河| |iceberg|gladiator;glance

24|desert|沙漠；遺棄；拋棄| |wilderness;solitude;wasteland|deserve;dessert
24|devastating|毀滅性的；有破壞力的| |disastrous;destructive|vast;waste
24|dissolve|分解；使溶解；使液化；解散| |melt;fuse|solve;resolve;resolution
24|diversity|差異；多樣化|biological diversity|difference;variety|university;adversity;diverge;divert;universe;verse
24|drought|乾旱；旱災| |dryness;dehydration|drop;droppings;drowsy;draught
24|dump|傾倒；拋棄；垃圾場|dump someone|drop|dumpling;bump;grumpy;jump;lump;pump;slump;stump
24|ecology|生態（學）| |nature;environment|ecosystem;economic;economical;economy
24|emission|排放；散發；射出| |discharge;release;leak|mission;admission;omission
24|evoke|喚起；引起| |arouse;awaken;recruit;induce;summon up;give rise to|invoke;provoke;revoke;vocal
24|exposure|暴露；曝光；揭露| |publicity;revelation|explosion;exposition
24|extent|程度；限度；寬度；長度|to some extent|amount;breadth;length;stretch;volume;width|tent;extensive;intensive;external;extant
24|extinct|絕種的；熄滅的| |gone;lost;vanished|extent;exterior
24|famine|饑荒| |hunger;starvation|female;mine
24|forecast|預測；預報| |predict;foresee;foretell|cast;broadcast;downcast
24|fossil|化石|living fossil|remains;relic;vestige|fussy;fuzzy
24|fragile|易碎的；易損壞的；脆弱的；纖細的| |delicate;fine;flimsy;frail;weak|agile;fragment;fragrance

25|global|全球的；全面的| |worldwide;international;universal|glory;glow;glue
25|humanity|人類；人性；人道；仁慈|crimes against humanity|creature;individual;mortal|humane;humid;humble;hum;humiliate
25|hybrid|雜交種；混合種；混合| |mixture;combination;compound|breed
25|impact|衝擊；影響；衝擊；影響|have a significant impact on|collision;crash;effect;influence;consequence|pact;compact
25|inspect|檢查；審查| |examine;check;investigate;survey;scrutinize|aspect;circumspect;prospect;respect;retrospect
25|mammal|哺乳動物| | |mama;madam;maternal
25|marine|海的；海生的；航海的| |nautical;naval|mariner;marinade
25|massive|巨大的；大量的；大規模的| |enormous;gigantic;immense|passive;massacre;massage;mascot;masquerade
25|migrant|移民；候鳥| |emigrant;immigrant;wanderer;nomad|migraine
25|migration|遷移；遷徙| | |migrant
25|moisture|濕氣；水分| |dew;liquid;damp|moist;moss;posture;gesture
25|native|本地人；本國人；本地的；本土的；土著的|native soil|inhabitant;aborigine;citizen;dweller|nation
25|offspring|子孫；後代| |descendant;successor|offset;spring;offshore
25|outbreak|爆發| |eruption;burst;epidemic|break;breakdown
25|perish|消滅；死去|Perish the thought!|expire|vanish;banish;cherish
25|petroleum|石油|petroleum jelly|gasoline;petrol|petrify
25|predator|捕食性動物；食肉動物| |beast|predecessor;predict;prey
25|prey|獵物；犧牲者；捕食；獵獲|be/fall prey to|victim|pray

26|prosper|繁榮；昌盛；成功| |flourish;progress;thrive|whisper;prose
26|reduce|減少；降低| |lessen;decrease;curtail;diminish|deduce;produce;seduce;introduce
26|refuge|避難；庇護所|take/seek refuge|exile;displaced person|refuse;refund;refreshment
26|reproduce|繁殖；複製；重現| |breed;multiply;copy;duplicate|produce;product;deduce;seduce
26|reptile|爬蟲類| | |fertile;futile;hostile;tile
26|scene|場景；鏡頭；場面；現場|make a scene;behind the scenes|setting;location;landscape;view|scent;obscene
26|soil|泥土；土壤；領土|native soil|earth;clay;dust;dirt|soldier;solid;solace;solitude
26|species|物種|endangered species|kind;breed;category;variety;sort|special;specific;specify;specimen;spectacular;spectator;speculate
26|struggle|奮鬥；鬥爭；努力；掙扎|power struggle|strive;exert oneself;make an effort;fight|juggle;smuggle
26|sustainable|可持續的；能長期維持的|environmentally sustainable|continuous|sustain
26|temperature|溫度；氣溫|have a temperature;take someone's temperature|heat|temperament;temper;tempo;temple;tempest;tempt
26|trace|追蹤；追溯；痕跡；遺跡|disappear without a trace|detect;discover;track|ace;race;tract;tractor
26|tropical|熱帶的；位於熱帶的| |sweltering;steamy|trope;troop;trophy
26|vapor|水氣；煙霧|water vapor|fog;mist;steam|various;variety
26|vegetation|植物；草木；植被| |plant;flora|vague;vagabond;vainglorious
26|vibrate|震動；顫動| |shake;quiver;tremble|calibrate;celebrate;vertebrate
26|wildlife|野生動植物|wildlife reserve|fauna|wild;wilderness
`;

const unitNames = {
  19: 'Unit 19 · 身心健康（1）', 20: 'Unit 20 · 身心健康（2）',
  21: 'Unit 21 · 身心健康（3）', 22: 'Unit 22 · 身心健康（4）',
  23: 'Unit 23 · 環境生態（1）', 24: 'Unit 24 · 環境生態（2）',
  25: 'Unit 25 · 環境生態（3）', 26: 'Unit 26 · 環境生態（4）',
};

// 移除同名的舊匯入單元（若有），讓這支程式可安全重跑。
const unitIds = new Set(Object.keys(unitNames).map(n => `photo-unit-${n}`));
db.units = db.units.filter(u => !unitIds.has(u.id));
db.words = db.words.filter(w => !unitIds.has(w.unitId));
for (const [number, name] of Object.entries(unitNames)) {
  db.units.push({ id: `photo-unit-${number}`, name, bookId: 'ios-default-book', createdAt: now,
    note: '依 Unit 19–26 課本照片匯入：含主單字、搭配用法、近義字、形近字', source: 'Unit19-26_課本照片' });
}

let serial = 0;
function add(unit, anchor, term, meaning, kind) {
  const cleaned = term.trim();
  if (!cleaned) return;
  // 同一主字下重複出現的詞，只建立一次。
  const key = `${unit}|${anchor.toLowerCase()}|${cleaned.toLowerCase()}|${kind}`;
  if (seen.has(key)) return;
  seen.add(key);
  db.words.push({
    id: `photo-u${unit}-${String(++serial).padStart(4, '0')}`,
    anchor, term: cleaned, meaning: meaning || '請依課本脈絡複習', pos: null, kind,
    unitId: `photo-unit-${unit}`, createdAt: now,
  });
}
const seen = new Set();
for (const line of rows.trim().split('\n').filter(line => line.trim())) {
  const [unitText, term, meaning, collocations, synonyms, similars] = line.split('|').map(x => x.trim());
  const unit = Number(unitText);
  add(unit, term, term, meaning, '主單字');
  for (const c of collocations.split(';').map(x => x.trim()).filter(Boolean)) add(unit, term, c, `搭配用法：${meaning}`, '搭配用法');
  for (const s of synonyms.split(';').map(x => x.trim()).filter(Boolean)) add(unit, term, s, `近義／相關字：${meaning}`, '近義字');
  for (const s of similars.split(';').map(x => x.trim()).filter(Boolean)) add(unit, term, s, `形近字（與 ${term} 一併辨識）`, '形近字');
}
db.updatedAt = now;
fs.writeFileSync(output, JSON.stringify(db, null, 2) + '\n');
console.log(JSON.stringify({output, units: 8, addedWords: serial, totalWords: db.words.length}, null, 2));
