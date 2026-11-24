# 快速記憶法

英文字彙學習工具，包含 local-first 網頁版與原生 iOS 專案。

## 專案入口

- 網頁版：`index.html`、`app.js`、`styles.css`
- iOS：`QuickMemoryIOS/QuickMemoryIOS.xcodeproj`
- 資料同步說明：`SUPABASE_SYNC_SETUP.md`
- UI/UX 與資料保護交接：`CLAUDE_UI_UX_HANDOFF.md`、`CLAUDE_UIUX_BRIEF.md`

網頁版的學習狀態以瀏覽器 IndexedDB 保存。修改學習流程前，請先閱讀交接文件，保留既有資料結構、學習紀錄與熟練度規則。

## 開啟 iOS 專案

在 Xcode 開啟 `QuickMemoryIOS/QuickMemoryIOS.xcodeproj`。

## 備註

`.gitignore` 會排除字彙／學習資料 JSON、ZIP/TAR 封存檔、快取、`Backups/` 與 Xcode 使用者狀態。Xcode 資產目錄需要的 `Contents.json` 會保留。
