const fs = require('fs');
const path = '/Users/lhry716/Documents/快速記憶法/快速記憶法備份_Unit19-26_已匯入.json';
const db = JSON.parse(fs.readFileSync(path, 'utf8'));
const DAY = 24 * 60 * 60 * 1000;
// `at` 是每一題作答／初學 round 的時間；前一次執行已平移其餘欄位，
// 因此本次只補平移這個欄位，避免其他排程再被加一天。
const timestampKeys = new Set(['at']);
let shiftedTimestamps = 0;
let shiftedDays = 0;

function walk(value) {
  if (Array.isArray(value)) return value.forEach(walk);
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (timestampKeys.has(key) && typeof child === 'number') {
      value[key] = child + DAY;
      shiftedTimestamps++;
    } else if (false && key === 'lastScoredDay' && typeof child === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(child)) {
      const d = new Date(`${child}T12:00:00+08:00`);
      d.setTime(d.getTime() + DAY);
      value[key] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
      shiftedDays++;
    } else {
      walk(child);
    }
  }
}

walk(db);
db.updatedAt = Date.now(); // 匯出時間維持現在，不納入「學習紀錄」平移
fs.writeFileSync(path, JSON.stringify(db, null, 2) + '\n');
console.log(JSON.stringify({ shiftedTimestamps, shiftedDays, path }, null, 2));
