# LINE 登入設定

LINE 登入使用伺服器端 OAuth code flow：LINE Channel Secret 僅由 Cloud Functions 讀取，瀏覽器只會收到短期 Firebase custom token。前端不包含 Channel Secret。

## LINE Developers

1. 完成 LINE Developers 開發者帳戶註冊，建立 Provider，再建立 **LINE Login** channel。
2. 在 channel 的 Callback URL 加入：

   `https://class-20261016.web.app/api/line/callback`

   若改用自訂網域，請同步修改 `functions/index.js` 的 `APP_ORIGIN` 預設值，並使用 `https://<你的網域>/api/line/callback`。
3. 複製 Channel ID。Channel Secret 留在 LINE Developers Console，稍後透過 Firebase Secret Manager 設定；不要放進 HTML、`.env` 或 Git。

## Firebase

1. 在 Authentication 的 Authorized domains 確認有 `class-20261016.web.app`；本機用 Emulator 時也加入 `localhost`（不含連接埠）。
2. 在 Firebase 專案設定 Channel ID：部署時 Firebase CLI 會要求 `LINE_CHANNEL_ID`。
3. 用 Firebase CLI 設定 Secret（CLI 會以隱藏輸入方式提示）：

   ```sh
   firebase functions:secrets:set LINE_CHANNEL_SECRET
   ```

4. Cloud Functions for Firebase 部署需要 Blaze 計費方案。完成 Channel 設定及確認計費方案後，部署 Hosting 與 Functions：

   ```sh
   firebase deploy --only hosting,functions
   ```

## 流程與安全

- 使用 LINE Login 的 `openid profile` scope；不要求 email 權限。
- 登入流程使用一次性 state/nonce cookie，後端向 LINE 驗證 ID token，再建立 Firebase 使用者並簽發 custom token。
- 自訂網域、Callback URL 或 Firebase Hosting 網域變更時，必須同步調整 LINE channel 設定與 `APP_ORIGIN`。
- 本機 Python 靜態伺服器不包含後端路由。要在本機完整測試，請使用 Firebase Local Emulator Suite，並在本機安全設定必要參數。
