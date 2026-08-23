# 部署

上線的操作手冊。選型的理由不在這裡，看 `decisions/0005-deploy-vercel-neon.md`。

平台是 Vercel，資料庫是 Neon。免費方案的額度與限制以官網為準，這裡不抄。

## 上線前必須先做：把本機和線上的 Neon branch 分開

`decisions/0005` 的結論是「地端與雲端都連 Neon，**本機用另一個 branch**」。
如果兩邊共用同一條 branch，本機的每一次亂試都直接打在正式資料上——
開發過程會建假資料、清空資料表、跑會寫入的整合測試（`db/write-path.test.ts`），
這些都不該碰到真正的打卡紀錄。

做法：Neon 主控台開一條 `dev` branch（copy-on-write，幾秒鐘），
把它的連線字串放進本機的 `.env.local`；`production` 那條留給 Vercel。

從連線字串看不出它屬於哪條 branch，只能去主控台對。**每次換過連線字串都要重新確認一次。**

## 環境變數

| 變數 | 值 |
|---|---|
| `DATABASE_URL` | Neon **production** branch 的連線字串 |
| `AUTH_SECRET` | session cookie 的簽章金鑰。`npx auth secret` 產生，**production 用跟本機不一樣的那一組** |
| `AUTH_GOOGLE_ID` | Google OAuth Client ID |
| `AUTH_GOOGLE_SECRET` | Google OAuth Client Secret |

`AUTH_URL` 不用設，Auth.js 在 Vercel 上會自己認出網域。

設在 Vercel → Settings → Environment Variables，勾 Production / Preview / Development。

Preview 要不要連同一個資料庫，自己決定：連同一條的話，每個 PR 的預覽站都會動到正式資料。

**pooled 還是 direct 都可以。** `db/index.ts` 走 `drizzle-orm/neon-http` + `neon()`，
是無狀態的 HTTP 呼叫、不持有連線，所以 pooler 對它沒有差別。
哪天為了跨語句 transaction 換成 `drizzle-orm/neon-serverless`（WebSocket），
才需要挑 pooled 那條。

本機的 `.env.local` 已被 `.gitignore` 的 `.env*` 擋住，連線字串不會進 repo。

**部署完要回 Google Cloud Console 補一條 redirect URI**：
`https://<你的網域>/api/auth/callback/google`。少了它，登入會在跳回來的時候失敗，
而且錯誤訊息出現在 Google 那一頁不是你的 app 上，第一次遇到會找不到方向。

## Google 的發布狀態決定誰登得進來

這一節比 redirect URI 更容易被忽略，但它直接決定「這個 app 有沒有人能用」。

| 發布狀態 | 誰登得進來 | 需要什麼 |
|---|---|---|
| **測試中**（預設） | 專案擁有者，加上手動列在「測試使用者」的帳號，**上限 100 位** | 什麼都不用 |
| **Production** | 任何有 Google 帳號的人 | 品牌頁的首頁／隱私權政策／服務條款網址，以及已驗證擁有權的授權網域 |

**「我自己登得進去」不能證明別人登得進去。** 專案擁有者不受測試使用者清單限制，
所以自測永遠會過。要驗開放性，得找一個不在清單上、也不是專案成員的帳號試。

切到 Production 有一個順序上的死結：品牌頁那三個網址要填公開 URL，
而 URL 的網域必須先註冊在「授權網域」並驗證擁有權——**所以得先部署拿到網域，
才填得了那三欄，才按得動「發布應用程式」**。在那之前按鈕是灰的，
畫面上只會說「OAuth 設定未完成」，不會告訴你缺哪一欄。

給認識的人用的話，測試中的 100 位額度就夠，不必走發布。

**不要按「設為內部」。** 那是給 Google Workspace 組織用的，會把登入限制在該組織成員。

### 同意畫面的 logo 不會顯示

上傳了也不會出現——它要通過 Brand verification 才會渲染，而驗證要有隱私權政策、
服務條款與已驗證的網域。測試中的 app 只會看到「登入『<專案名稱>』」配 Google 自己的圖示。
原檔留在 `docs/assets/`，等真的要開放註冊、本來就得寫隱私權政策時再一起處理。

Auth.js 的 session 是我們自己用 `AUTH_SECRET` 簽的 JWT，登入後不再呼叫 Google 的 API，
所以測試模式對 Google refresh token 的效期限制不影響使用者的登入狀態。

## 一個會讓你以為部署成功的陷阱

`getDb()` 的連線是 lazy 的——這是 `decisions/0005` 刻意的設計，讓 `npm run build`
與 `npm run typecheck` 不需要資料庫。副作用是：

**`DATABASE_URL` 沒設也會 build 成功，然後每一頁都 500。**

四個路由全是 `force-dynamic`，每個請求都要讀資料庫，沒有一頁能在缺變數時活下來。
所以順序是：**先設環境變數，再 deploy。** 反過來的話，你會看到一次綠色的部署
和一個全壞的網站。

## Vercel 專案設定

`next.config.ts` 是空的，也沒有 `vercel.json`，Next.js 會被自動偵測，所以全部用預設：

- Framework Preset：Next.js
- Build Command：`npm run build`
- Root Directory：`./`
- Node 版本：`package.json` 沒有 `engines` 欄位，吃 Vercel 的預設。
  Next 自己要求的下限查得到：`node -p "require('next/package.json').engines.node"`
  （寫這份文件時是 `>=20.9.0`）。Vercel 的預設遠高於此，不用動。
  要釘死的話在 `package.json` 加 `"engines": { "node": ">=20.9" }`。

## Migration 不會自動跑

`db:migrate` 沒有掛在 `build` 上，**Vercel 部署不會套用 migration**。
單人專案維持這樣就好：從本機手動對 production branch 跑，時機自己控制。

```
DATABASE_URL='<production 的連線字串>' npm run db:migrate
```

第一次部署前要跑一次，把 `db/migrations/` 底下的都套上去。
之後每次改完 `db/schema.ts`、跑過 `db:generate`，都要記得再對 production 跑一次——
**忘了跑的症狀是線上報 column 不存在，本機卻一切正常。**

## 上線後走一遍

- 四個路由都開得起來：`/`、`/plans/[id]`、`/plans/[id]/today`、`/plans/[id]/review`
- 用 Google 登入、登出、再登入
- 建立計劃表 → 填次目標 → 填行為 → 打卡 → 改核心目標名稱 → 移除一格 → 刪計劃表
- **資料隔離**：換一個 Google 帳號登入，確認看不到前一個帳號的計劃表
- 瀏覽器 console 沒有錯誤
- 手機上實際開一次今天頁（那才是它存在的理由）

**第一個請求會慢幾秒是正常的。** Neon 免費方案閒置會 suspend，那是睡著不是刪資料，
下次請求自己醒（`decisions/0005`）。

## 不要做的事

- 不要為了讓 build 過就給 `DATABASE_URL` 一個假值或改成靜默 fallback。
  `getDb()` 沒有變數時直接丟錯是刻意的。
- 不要把 migration 掛進 build。build 會在每次部署、每個 preview 上跑，
  等於讓每一個 PR 都有權改正式資料庫的 schema。
- 不需要 Dockerfile。Vercel 吃的是 git push，資料庫是託管的（`decisions/0005`）。
- 不要把本機的 `AUTH_SECRET` 直接搬去 production。它是簽 session 的金鑰，
  兩邊共用等於本機開發能簽出線上認得的 cookie。
