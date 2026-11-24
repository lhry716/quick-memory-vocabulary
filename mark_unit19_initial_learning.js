const fs = require('fs');
const path = '/Users/lhry716/Documents/快速記憶法/快速記憶法備份_Unit19-26_已匯入.json';
const db = JSON.parse(fs.readFileSync(path, 'utf8'));
const unitId = 'photo-unit-19';
// 「昨天」以台北時間 2026-10-11 晚上 8 點作為完成時間。
const completedAt = new Date('2026-10-11T20:00:00+08:00').getTime();
const dueAt = new Date('2026-10-12T20:00:00+08:00').getTime();
const words = db.words.filter(word => word.unitId === unitId);

for (const word of words) {
  word.initialDifficulty = 'A';
  word.initialLearning = { completedAt, rounds: [{ at: completedAt, known: true, round: 1, wordId: word.id }] };
  word.mastery = {
    hasPassedFinalReview: false, isRecoveryConfirmation: false,
    lastScoredAt: null, lastScoredDay: null, lastTestAt: null, lastTestCorrect: null,
    modelVersion: 7, needsRecovery: false, nextDueAt: dueAt, qualifiedCount: 0,
    recoveryTargetStage: null, reviewAnchorAt: completedAt, stage: 1, status: '學習中', tests: 0,
  };
}

// 刪除舊的 Unit 19 排程後，依每 20 個詞建立初學完成後的第一階段複習排程。
for (const key of Object.keys(db.groupReviewSchedules || {})) if (key.startsWith('photo-unit-19-g')) delete db.groupReviewSchedules[key];
for (let index = 0; index < words.length; index += 20) {
  const groupId = `photo-unit-19-g${String(index / 20 + 1).padStart(2, '0')}`;
  db.groupReviewSchedules[groupId] = { hasPassedFinalReview: false, modelVersion: 9, nextDueAt: dueAt, reviewAnchorAt: completedAt, stage: 1 };
}
db.updatedAt = Date.now();
fs.writeFileSync(path, JSON.stringify(db, null, 2) + '\n');
console.log(`Updated ${words.length} Unit 19 words as initially learned on 2026-10-11.`);
