const fs = require('fs');
const { execFile } = require('child_process');
const path = '/Users/lhry716/Documents/快速記憶法/快速記憶法備份_Unit19-26_已匯入.json';
const db = JSON.parse(fs.readFileSync(path, 'utf8'));
const related = db.words.filter(word => /^photo-unit-/.test(word.unitId) && word.kind !== '主單字');
const terms = [...new Set(related.map(word => word.term))];

function requestTranslation(batch) {
  return new Promise((resolve, reject) => {
    execFile('curl', ['-G', '-L', '--max-time', '30', '-sS',
      '--data-urlencode', 'client=gtx', '--data-urlencode', 'sl=en',
      '--data-urlencode', 'tl=zh-TW', '--data-urlencode', 'dt=t',
      '--data-urlencode', `q=${batch.join('\n')}`,
      'https://translate.googleapis.com/translate_a/single'], { maxBuffer: 1024 * 1024 }, (error, stdout) => {
      if (error) return reject(error);
      try {
        const parsed = JSON.parse(stdout);
        const translated = parsed?.[0]?.map(part => part?.[0] || '').join('') || '';
        resolve(translated.split('\n'));
      } catch (parseError) { reject(parseError); }
    });
  });
}

(async () => {
  const translations = new Map();
  const batchSize = 40;
  for (let index = 0; index < terms.length; index += batchSize) {
    const batch = terms.slice(index, index + batchSize);
    const result = await requestTranslation(batch);
    if (result.length !== batch.length) throw new Error(`翻譯回傳筆數不符：${result.length} / ${batch.length}`);
    batch.forEach((term, offset) => translations.set(term, result[offset].trim()));
    console.log(`Translated ${Math.min(index + batch.length, terms.length)}/${terms.length}`);
  }
  let changed = 0;
  for (const word of related) {
    const meaning = translations.get(word.term);
    if (meaning) { word.meaning = meaning; changed++; }
  }
  db.updatedAt = Date.now();
  fs.writeFileSync(path, JSON.stringify(db, null, 2) + '\n');
  console.log(JSON.stringify({ uniqueTerms: terms.length, changed }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
