const fs = require('fs');
const dbPath = '/Users/lhry716/Documents/快速記憶法/快速記憶法備份_Unit19-26_已匯入.json';
const ocrPath = '/tmp/unit19_26_ocr.txt';
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
const lines = fs.readFileSync(ocrPath, 'utf8').split(/\r?\n/);
const cjk = /[\u3400-\u9fff]/;
const missingMeanings = {
  'It emerged that ...': '事情的真相是……', 'Perish the thought!': '死了這條心吧！',
  'a course of antibiotics': '一療程的抗生素', 'a fertile imagination': '豐富的想像力',
  'a skeleton in the closet': '醜事；隱情', 'anti-': '反（用於構成形容詞）', 'arteries': '動脈',
  bacteria: '細菌', 'bad cholesterol level': '壞膽固醇值', 'be accustomed to (doing) something': '習慣（做）某件事情',
  'be obsessed by/with': '對某事／某人非常著迷', 'café': '咖啡館；小餐館',
  'check-in': '投宿登記手續；報到', checkout: '（超市的）付款櫃檯；（旅館的）結帳離開時間',
  'clinical trials': '臨床試驗', compound: '複合物；混合物；化合物',
  compulsive: '難以抑制的；強迫性的；強制性的', 'conservation area': '（自然環境或建築物）保護區',
  cosmopolitan: '國際性的；無狹隘偏見的', countdown: '倒數計秒', deplete: '耗盡；用盡',
  'diagnose someone as having something': '診斷出某人得到某種疾病', 'diagnose someone with something': '診斷出某人得到某種疾病',
  diagram: '圖表；圖解', 'drinks containing caffeine': '含有咖啡因的飲料', equilibrium: '平衡；均衡；心情平靜',
  fundamental: '基本的；十分重要的；基本原則', 'have a significant impact on': '對……有重大的影響',
  hospitable: '好客的；招待周到的；（氣候等）宜人的', idiotic: '愚蠢的', 'in full blossom': '盛開',
  individual: '個人；個體；個人的；個體的', intellectual: '智力的；理智的；知識份子',
  'keep a balance between A and B': '在 A 與 B 之間保持平衡', 'keep calm': '保持鎮定',
  madam: '夫人；太太；小姐', mandatory: '強制的；法定的', migrant: '移民；候鳥', mist: '霧；薄霧',
  moist: '潮濕的；多雨的', monumental: '紀念建築物的；紀念性的；極大的', muster: '召集；鼓起勇氣；使振作',
  paradox: '似是而非的說法；悖論；自相矛盾的情況', preoccupy: '使全神貫注；使入神', reed: '蘆葦',
  "send shivers down someone's spine": '使……感到毛骨悚然', sentimental: '感傷的；多情的；感情用事的',
  stock: '家系；血統', lump: '團；塊', sustain: '保持；維持；使持續；供養', universal: '全體的；普遍的；宇宙的；全世界的',
  unproductive: '不生產的；無收益的；徒勞的', 'vaccinate someone against something': '讓某人施打疫苗來對抗某種疾病',
  vocal: '聲的；聲音的', 'working environment': '工作環境', worldwide: '遍及全球的；在世界各地'
};

function escapeRegExp(text) { return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function ownMeaning(term) {
  // Find the printed vocabulary row that contains the exact English term and a Chinese definition.
  const re = new RegExp(`(^|[^a-z])${escapeRegExp(term.toLowerCase())}($|[^a-z])`, 'i');
  for (const line of lines) {
    if (!re.test(line) || !cjk.test(line)) continue;
    const lower = line.toLowerCase();
    const index = lower.indexOf(term.toLowerCase());
    if (index < 0) continue;
    const suffix = line.slice(index + term.length);
    const start = suffix.search(cjk);
    if (start < 0) continue;
    let value = suffix.slice(start)
      .replace(/[｜|]/g, '；')
      .replace(/\s+/g, ' ')
      .replace(/^；+|；+$/g, '')
      .trim();
    // OCR sometimes carries a following English word; retain only the Chinese definition segment.
    value = value.replace(/\s+[A-Za-z][A-Za-z' -]*$/, '').trim();
    // OCR often reads the printed part-of-speech box as 「回／口／团」 before the definition.
    value = value.replace(/^[回口囗团田目日]\s*/, '');
    if (value.length >= 1 && value.length <= 80) return value;
  }
  return null;
}

const related = db.words.filter(w => /^photo-unit-/.test(w.unitId) && w.kind !== '主單字');
let replaced = 0;
const missing = new Set();
for (const word of related) {
  const meaning = ownMeaning(word.term) || missingMeanings[word.term];
  if (meaning) { word.meaning = meaning; replaced++; }
  else missing.add(word.term);
}
db.updatedAt = Date.now();
fs.writeFileSync(dbPath, JSON.stringify(db, null, 2) + '\n');
fs.writeFileSync('/tmp/unit19_26_ocr_missing_terms.txt', [...missing].sort().join('\n') + '\n');
console.log(JSON.stringify({ relatedCards: related.length, replaced, missing: missing.size }, null, 2));
