# DAYFLOW

DAYFLOW 是以繁體中文呈現的個人待辦事項工具，提供今日待辦、月曆與近期安排、習慣追蹤及專注計時。網站採用原生 HTML、CSS 與 JavaScript Modules，可直接透過靜態伺服器執行。

## 本機啟動

在專案根目錄啟動靜態伺服器：

```sh
python3 -m http.server 4173
```

接著開啟 <http://localhost:4173/>。Firebase 登入使用 `localhost`，不要改用 `127.0.0.1`，除非已在 Firebase Authentication 的授權網域中加入該 IP。

## 功能

- 今日待辦支援新增、編輯、刪除、完成／復原、日期、時間、優先程度、備註、狀態篩選及排序。
- 月曆與接下來整合在同一頁，可切換月份、查看待辦並從日期直接新增。
- 習慣可自訂名稱、每日或每週頻率，並保留打卡、連續紀錄及完成率。
- 專注計時支援自訂時長、開始、暫停、繼續、結束及專注紀錄。
- 首頁時間與迷你月曆整合顯示；首頁摘要模組可新增、移動、調整大小、隱藏、重新命名及還原預設布局。手機、平板與桌機使用獨立布局。
- 支援搜尋、淺色／深色顯示、時間格式偏好，以及 JSON 匯入／匯出。
- DAYFLOW AI 共用待辦、行事曆、習慣與專注情境；可提供自然語言整理、排程與目標建議。新增待辦會直接加入並通過欄位與時間衝突檢查；其他變更會先預覽並由使用者確認。

## DAYFLOW AI 與 App Check

Firebase AI Logic 已在 Firebase 專案 `class-20261016` 的 Web App 啟用，並以 Gemini Developer API 的 `gemini-3.5-flash-lite` 產生 JSON 結果。前端不放 Gemini API Key；`src/runtime-config.js` 的 reCAPTCHA Enterprise Site Key 是公開的網站金鑰，並限制於 Firebase Hosting 網域 `class-20261016.web.app` 與 GitHub Pages 網域 `fanyukai9-jpg.github.io`。App Check provider 已在 Firebase 註冊。

DAYFLOW 每個瀏覽器最多送出 5 次 AI 請求／分鐘；Firebase 專案或模型本身也可能有較低的配額，或暫時無法服務。

如果要在本機執行真實 AI 呼叫，請在 `src/runtime-config.js` 將 `appCheckDebug` 設為 `true`，載入網站後從瀏覽器 console 複製 Firebase 顯示的一次性 App Check debug token，並在 Firebase Console 的 App Check → Apps → 管理 debug tokens 註冊。Debug token 具有略過 App Check 驗證的權限，只用於私人本機測試；不要提交 token 到版本控制，也不要用於正式部署。正式網站使用已設定的 reCAPTCHA Enterprise provider。

目前 App Check enforcement 尚未開啟。正式發布前先部署更新版並觀察 AI Logic 的 App Check 指標，再啟用 enforcement，避免尚未更新的用戶突然失去服務。Firebase Authentication 只允許已列入授權網域的來源；本機登入請使用 `localhost`，若看到未授權網域訊息，需在 Firebase Authentication → Settings → Authorized domains 加入實際使用的主機名稱。

每次 AI 呼叫只帶入當前功能的必要摘要：近期最多 24 項待辦、最多 12 個習慣及近 7 天最多 10 筆專注紀錄；習慣紀錄限制於近 14 或 28 天。AI 對話存在目前瀏覽器，不上傳 Firestore。AI 新增待辦會先經欄位與排程衝突檢查，再直接寫入；其他待辦或習慣變更會先顯示預覽並由使用者確認。

## 資料

待辦、習慣、專注紀錄、設定及 AI 對話保存在瀏覽器 LocalStorage。若使用 Google 帳戶登入並啟用同步，DAYFLOW 資料也會保存在 Firebase Firestore；AI 對話只保存在此裝置。匯入前建議先匯出 JSON 備份。

從舊版 DAYFLOW 載入的任務、習慣與專注紀錄會保留。舊版清單或專案欄位留在相容資料中，不會出現在目前的操作介面。

## GitHub Pages

在 GitHub 儲存庫開啟 **Settings → Pages**，將來源設為 `Deploy from a branch`，選擇 `main` 分支與 `/(root)` 資料夾並儲存。
