# JSON 備份格式

本專案不附帶個人字彙或學習資料。以下說明的是網頁版匯出的**完整備份 JSON**，iOS app 也可匯入同一份檔案。

## 建議產生方式

不要從零手寫完整備份。先在網頁版用「資料管理 → 新增 Unit」輸入字彙，再用「資料管理 → 匯出 JSON」產生檔案。這樣會自動建立 ID、組別及目前版本需要的欄位。

新增單元也可使用 CSV/TXT，每行一筆：

```text
英文單字,中文意思
abandon,放棄；遺棄
abundant,豐富的；充裕的
```

## 結構

根節點是 JSON 物件，陣列中的 ID 以字串表示，相關欄位透過 ID 互相參照。網頁版目前輸出的版本欄位是 `11`；匯入時會執行相容性遷移，請保留匯出檔中的 `version` 與欄位。

```json
{
  "version": 11,
  "books": [{ "id": "book-1", "name": "英文單字" }],
  "units": [{
    "id": "unit-1",
    "bookId": "book-1",
    "name": "Unit 1",
    "createdAt": 1790000000000,
    "note": "",
    "source": "手動匯入"
  }],
  "words": [{
    "id": "word-1",
    "unitId": "unit-1",
    "term": "abandon",
    "meaning": "放棄；遺棄",
    "kind": "主字",
    "anchor": "abandon",
    "pos": "v.",
    "initialDifficulty": null,
    "initialLearning": null,
    "mastery": null,
    "createdAt": 1790000000000
  }],
  "studyGroups": [{
    "id": "group-1",
    "unitId": "unit-1",
    "groupNumber": 1,
    "wordIds": ["word-1"],
    "createdAt": 1790000000000
  }],
  "tests": [],
  "learningSessions": [],
  "relearningSessions": [],
  "pausedSessions": [],
  "activeSession": null,
  "updatedAt": 1790000000000
}
```

上例只是欄位示意，不是可取代正式匯出檔的完整學習備份。未學習的單字可用 `null` 表示 `initialDifficulty`、`initialLearning` 和 `mastery`；已學習的詞條還會有學習難度、各輪作答與熟練度資料，應由 app 產生並原樣保留。

## 主要欄位

- `books`: 字彙書集合；每項至少有 `id`、`name`。
- `units`: 單元集合；每項至少有 `id`、`bookId`、`name`。
- `words`: 詞條集合；每項至少有 `id`、`unitId`、`term`、`meaning`。`kind`、`anchor`、`pos` 用於分類和字族資訊。
- `studyGroups`: 固定組別；每項以 `wordIds` 指向 `words` 中的詞條。沒有組別時 app 可補建，但正式備份應保留匯出的組別與順序。
- `tests`: Test 紀錄。紀錄包含 `unitId`、`wordIds`、`responses`、`rounds` 等欄位；答案通常含 `wordId`、`known`、`round`、`at`。
- `learningSessions`、`relearningSessions`、`pausedSessions`、`activeSession`: 初學、重新初學與暫存中的練習資料。沒有資料時通常是空陣列或 `null`。
- `updatedAt`、`createdAt` 及紀錄時間：Unix 時間戳，單位為**毫秒**。

網頁版備份匯入至少需要 `units`、`words`、`tests` 三個陣列；iOS app 需要 `units` 與 `words`。匯入會取代該裝置現有資料，請先匯出備份。若要把完整學習紀錄帶到 iOS，請使用網頁版產生的完整匯出檔。
