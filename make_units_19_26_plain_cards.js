const fs = require('fs');

const source = '/Users/lhry716/Documents/快速記憶法/快速記憶法備份 2_Unit19-26_已修正.json';
const output = '/Users/lhry716/Documents/快速記憶法/快速記憶法備份 2_Unit19-26_完整單字卡.json';
const db = JSON.parse(fs.readFileSync(source, 'utf8'));
const now = Date.now();

const unit = (number) => `photo-unit-${number}`;
const isTarget = (word) => /^photo-unit-(19|20|21|22|23|24|25|26)$/.test(word.unitId);

// All photo-derived entries use the same card type.  term is the English front;
// meaning is the Chinese back.  No relationship label is retained on the card.
for (const word of db.words) {
  if (isTarget(word)) word.kind = '單字';
}

const existing = new Set(db.words.filter(isTarget).map((word) => `${word.unitId}|${word.term.toLowerCase()}`));
let serial = Math.max(0, ...db.words.map((word) => /^photo-card-(\d+)$/.exec(word.id)).filter(Boolean).map((m) => Number(m[1])));

function add(number, term, meaning) {
  const key = `${unit(number)}|${term.toLowerCase()}`;
  if (existing.has(key)) return;
  existing.add(key);
  db.words.push({
    id: `photo-card-${String(++serial).padStart(4, '0')}`,
    term,
    meaning,
    kind: '單字',
    anchor: term,
    pos: null,
    unitId: unit(number),
    initialDifficulty: null,
    initialLearning: null,
    mastery: null,
    createdAt: now,
  });
}

// Blue word-family entries OCRed from the supplied textbook photos.
const forms = {
  19: [
    ['allergic', '過敏的'], ['calmness', '安靜；安寧'],
    ['categorize', '將……分類；使列入……的範疇'], ['causal', '原因的；因果的'],
    ['clinical', '診所的；臨床的'],
  ],
  20: [
    ['cosmetics', '化妝品'], ['count', '計算；數；認為；計數；總數'],
    ['diagnosis', '診斷；診斷結果'], ['disabled', '殘障的；有缺陷的；殘障者'],
    ['disability', '殘障；缺陷'], ['dosage', '劑量；服用量'],
    ['emergence', '出現；浮現'], ['environmental', '環境的；有關環境的'],
    ['fertilizer', '肥料'], ['fertility', '肥沃；繁殖力；豐富'],
    ['handicapped', '殘障的'], ['herbal', '草本的'], ['herbalist', '草本植物學家；草藥醫生'],
  ],
  21: [
    ['hereditary', '遺傳的；世襲的'], ['hospital', '醫院'], ['immune', '免疫的；有免疫力的'],
    ['infection', '影響；感染'], ['infectious', '傳染性的；有感染力的'],
    ['injure', '傷害；損害'], ['mentality', '心理狀態；智力'],
    ['mortal', '致死的；致命的；終有一死的'], ['muscular', '肌肉的；肌肉發達的'],
    ['nourishment', '食品；營養物'], ['obsession', '困擾；執念；無法擺脫的念頭'],
    ['optimism', '樂觀；樂觀主義'], ['paralyze', '使癱瘓；使麻痺；使停頓'],
    ['pharmacist', '藥劑師；藥商'],
  ],
  22: [
    ['pregnancy', '懷孕'], ['recovery', '恢復；康復；挽回'], ['resist', '抵抗；反抗；忍住'],
    ['safe', '保險箱；安全的'], ['spinal', '脊椎的'], ['vaccine', '疫苗'], ['vigor', '體力；活力'],
  ],
  23: [
    ['accustomed', '習慣於'], ['breeding', '生育；繁殖；教養'],
    ['consequential', '隨之發生的；作為結果的；重大的'], ['consequently', '因此；所以'],
    ['conserve', '保存；節省'], ['demolition', '毀壞；破壞；拆除'], ['deplete', '耗盡；用盡'],
  ],
  24: [
    ['devastate', '摧毀；破壞'], ['dissolution', '消失；解散；瓦解'], ['diverse', '不同的；多樣的'],
    ['ecological', '生態（學）的'], ['emit', '發出；射出；散發'], ['expose', '使暴露於；使接觸到'],
    ['extension', '伸展；擴大；電話分機'], ['extend', '延長；擴大'], ['extinction', '滅種；絕種'],
  ],
  25: [
    ['globe', '球；球狀物；地球儀；地球'], ['human', '人；人的；有人性的'],
    ['inspection', '檢查；審查'], ['mass', '團；塊；大量；民眾'], ['migration', '遷移；遷徙'], ['moist', '潮濕的；多雨的'],
  ],
  26: [
    ['prosperity', '繁榮；昌盛；成功'], ['reduction', '減少；削減'], ['refugee', '難民；流亡者'],
    ['reproduction', '繁殖；再生；複製品'], ['scenery', '風景；景色'], ['scenic', '景色秀麗的'],
    ['sustain', '保持；維持；使持續；供養'], ['vaporize', '蒸發'],
    ['vegetable', '蔬菜；植物人；蔬菜的'], ['vegetarian', '素食者；食草動物'], ['vibration', '震動；顫動'],
  ],
};
for (const [number, entries] of Object.entries(forms)) {
  for (const [term, meaning] of entries) add(Number(number), term, meaning);
}

// The photo gives an additional noun sense for handicap; retain it in one card
// rather than making two indistinguishable English-front cards.
for (const word of db.words) {
  if (word.unitId === unit(20) && word.term === 'handicap') word.meaning = '妨礙；使不利；障礙；不利條件';
}

db.updatedAt = now;
fs.writeFileSync(output, JSON.stringify(db, null, 2) + '\n');
const report = Object.fromEntries(Object.keys(forms).map((number) => {
  const cards = db.words.filter((word) => word.unitId === unit(number));
  return [number, { cards: cards.length, allPlain: cards.every((word) => word.kind === '單字') }];
}));
console.log(JSON.stringify({ output, report }, null, 2));
