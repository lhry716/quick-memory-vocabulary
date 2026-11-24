const fs = require('fs');

const source = '/Users/lhry716/Downloads/快速記憶法備份 2.json';
const output = '/Users/lhry716/Documents/快速記憶法/快速記憶法備份 2_Unit19-26_已修正.json';
const db = JSON.parse(fs.readFileSync(source, 'utf8'));
const now = Date.now();

const unit = (number) => `photo-unit-${number}`;
const isPhotoWord = (word, number, anchor) =>
  word.unitId === unit(number) && (!anchor || word.anchor === anchor);

// OCR / page-order corrections verified against IMG_1381–IMG_1427.
// Keep card IDs and all learning history for words that merely change unit.
for (const word of db.words) {
  if (isPhotoWord(word, 19, 'disable') || isPhotoWord(word, 19, 'dose')) word.unitId = unit(20);
  if (isPhotoWord(word, 23, 'glacier')) word.unitId = unit(24);
}

// These three anchors already occur correctly in Unit 24.  The Unit 20 copies
// are an import-order duplication, not a second appearance in the textbook.
db.words = db.words.filter((word) => !(
  word.unitId === unit(20) && ['exposure', 'extent', 'extinct'].includes(word.anchor)
));

const existing = new Set(db.words.map((word) => `${word.unitId}|${word.anchor}|${word.term}|${word.kind}`));
let serial = Math.max(
  0,
  ...db.words
    .map((word) => /^photo-u19-(\d+)$/.exec(word.id))
    .filter(Boolean)
    .map((match) => Number(match[1]))
);

function add(anchor, term, meaning, kind) {
  const key = `${unit(19)}|${anchor}|${term}|${kind}`;
  if (existing.has(key)) return;
  existing.add(key);
  db.words.push({
    id: `photo-u19-${String(++serial).padStart(4, '0')}`,
    anchor,
    term,
    meaning,
    kind,
    pos: null,
    unitId: unit(19),
    initialDifficulty: null,
    initialLearning: null,
    mastery: null,
    createdAt: now,
  });
}

// Unit 19 p. 138: both entries were omitted entirely in the prior import.
[
  ['category', 'category', '種類；類目；範疇', '主單字'],
  ['category', 'class', '階級；種類；等級；級別；（動植物分類的）綱', '近義字'],
  ['category', 'division', '部分；分開；部門；處；課', '近義字'],
  ['category', 'sort', '種類', '近義字'],
  ['category', 'index', '索引；指標；表徵', '近義字'],
  ['category', 'cater', '提供飲食；承辦宴席；滿足需要', '形近字'],
  ['category', 'cattle', '牛；牲口', '形近字'],
  ['category', 'caterpillar', '毛毛蟲', '形近字'],
  ['category', 'catalog', '目錄；目錄冊', '形近字'],
  ['cause', 'cause', '原因；理由；導致；引起', '主單字'],
  ['cause', 'cause and effect', '因果關係', '搭配用法'],
  ['cause', 'have good cause to do something', '有充分的理由做某事', '搭配用法'],
  ['cause', 'source', '來源', '近義字'],
  ['cause', 'motivation', '刺激；推動；幹勁', '近義字'],
  ['cause', 'conviction', '信念', '近義字'],
  ['cause', 'clause', '條款；（文法的）子句', '形近字'],
  ['cause', 'pause', '暫停；中斷', '形近字'],
  ['cause', 'casual', '偶然的；隨便的；非正式的', '形近字'],
].forEach(([anchor, term, meaning, kind]) => add(anchor, term, meaning, kind));

db.updatedAt = now;
fs.writeFileSync(output, JSON.stringify(db, null, 2) + '\n');

const anchors = (n) => new Set(db.words.filter((word) => word.unitId === unit(n)).map((word) => word.anchor));
const report = Object.fromEntries([19, 20, 23, 24].map((n) => [n, {
  anchors: [...anchors(n)].sort(),
  cards: db.words.filter((word) => word.unitId === unit(n)).length,
}]));
console.log(JSON.stringify({ output, report }, null, 2));
