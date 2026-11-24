# 快速記憶法：網站與 iPhone 同步設定

這個專案採用 Supabase（Postgres、Auth、Row Level Security）作為共同後端。網站的 IndexedDB 與 iPhone 的本機備份仍是離線副本；雲端只負責把同一個帳號的改動合併到其他裝置。

## 先建立專案

1. 在 Supabase 建立一個新 project。
2. 在 SQL Editor 執行 `supabase/migrations/20260909_learning_sync.sql` 的完整內容。
3. 在 Authentication 啟用 Apple 登入；網站與 iOS 都要使用同一個 Supabase project。
4. 將網站的正式網址加入 Auth 的 Redirect URLs。開發時也加入目前的 localhost 位址。
5. 將 Project URL 與 **publishable / anon key** 提供給開發端。這兩者可以放在前端；**不要**提供或提交 `service_role`／secret key。

## 資料如何安全同步

第一次啟用同步時，裝置會先把現有 JSON 備份拆成下列資料列上傳：

- `unit`、`word`、`study_group`：可編輯的教材資料。
- `test`、各類 `session`：歷史紀錄與未完成的流程狀態。
- `preference`：目前選取的 Unit、分頁等裝置偏好。
- `learning_events`：每次作答、完成測驗等不可覆寫事件。

答題事件不以「整份備份最後寫入」同步，因此在網站與手機離線作答後再連線時，兩邊的作答都會留下。單字熟練度會由合併後的事件與最新版資料重新收斂。

## 衝突原則

- 答題、測驗完成：追加，絕不覆蓋。
- 同一個教材欄位在兩端都修改：以最後修改時間合併，並保留事件紀錄供復原。
- 首次同步遇到雲端已有資料：先顯示「合併／保留此裝置／保留雲端」；不自動清除。
- 刪除先標記為 tombstone，其他離線裝置同步完成前不會立刻物理刪除。

## 上線前檢查

- 確認所有三張資料表都啟用 RLS。
- 確認 `authenticated` 僅能讀寫自己的 `user_id`。
- 用兩個測試帳號驗證不能互相讀到資料。
- 用網站和 iPhone 離線各答一題，再回線驗證兩筆事件都存在。
