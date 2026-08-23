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

只有一個：

| 變數 | 值 |
|---|---|
| `DATABASE_URL` | Neon **production** branch 的連線字串 |

設在 Vercel → Settings → Environment Variables，勾 Production / Preview / Development。

Preview 要不要連同一個資料庫，自己決定：連同一條的話，每個 PR 的預覽站都會動到正式資料。

**pooled 還是 direct 都可以。** `db/index.ts` 走 `drizzle-orm/neon-http` + `neon()`，
是無狀態的 HTTP 呼叫、不持有連線，所以 pooler 對它沒有差別。
哪天為了跨語句 transaction 換成 `drizzle-orm/neon-serverless`（WebSocket），
才需要挑 pooled 那條。

本機的 `.env.local` 已被 `.gitignore` 的 `.env*` 擋住，連線字串不會進 repo。

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
- 建立計劃表 → 填次目標 → 填行為 → 打卡 → 改核心目標名稱 → 移除一格 → 刪計劃表
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
