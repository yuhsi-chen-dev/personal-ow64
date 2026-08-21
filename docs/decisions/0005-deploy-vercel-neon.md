# 0005. 部署與資料庫：Vercel + Neon Postgres

- 狀態：已採納，取代 [0002](0002-drizzle-sqlite.md)
- 日期：2026-08-21

## 決策

部署到 Vercel，資料庫用 Neon（serverless Postgres）。
Drizzle 保留，driver 換成 `@neondatabase/serverless` + `drizzle-orm/neon-http`。

**地端與雲端都連 Neon**，本機用另一個 branch，不保留本機 SQLite。

## 理由

需求是「免費且含資料庫的部署」。Vercel Hobby 免費（限非商業用途），是 Next.js
的原廠環境；Neon 免費方案閒置時自動 suspend，**是睡著不是刪資料**，下次請求自己醒。

評估後排除的：

- **Supabase 免費版** — 專案閒置約一週會被暫停要手動喚醒。這是「可能一週才想到打卡一次」
  的 app，正好踩中。
- **Render / Railway 免費版** — 免費 Postgres 有期限、服務會 spin down。
- **Cloudflare Pages + D1** — D1 本質是 SQLite，schema 幾乎不用改，是合理的次選；
  但 Next.js 上 Cloudflare 要透過 OpenNext adapter，設定較麻煩、可查的資料也少。
- **Fly.io + 持久磁碟** — 能保留 SQLite，但已無可靠的免費額度。

地端不留 SQLite，是因為同時維護兩種 SQL 方言的成本遠高於連遠端 dev branch。

## 後果

- 需要 `DATABASE_URL` 環境變數，本機放專案根目錄的 `.env.local`（已被 gitignore，
  Next.js 會自動載入）。沒設定時 `getDb()` 會直接丟錯，不要改成靜默 fallback。
  連線建立是 lazy 的，所以 `npm run build` 與 `npm run typecheck` 不需要這個變數。
  `drizzle-kit` 不是 Next 的一部分、不會自動讀 `.env.local`，所以 `db:migrate`
  這個 script 用 `node --env-file-if-exists=` 明確載入（用 `-if-exists` 是為了
  在 Vercel／CI 上沒有這個檔時不會失敗，那裡的環境變數由平台注入）。
- **建立 Neon 專案時不需要開啟 Neon Auth。** 那是「使用者登入 + 把使用者同步進 Postgres」
  的功能，現在是單機單使用者、沒有帳號系統，開了只會多出一組用不到的 schema，
  讓實際資料庫跟 `db/schema.ts` 對不起來。它隨時可以事後開啟，不是建立專案當下的決定。
  等到要做「手機打卡、跨裝置同步」時才需要，那時 `plans` 也要多一個 `userId` 欄位；
  屆時再比 Neon Auth 與 Auth.js 等方案。
- `neon-http` 不支援跨語句 transaction，需要原子性時用 `db.batch()`；
  真的需要完整 transaction 再換 `drizzle-orm/neon-serverless`。
- 免費方案的條件變動很快，額度與限制以官網為準，本文只記錄選型邏輯。
