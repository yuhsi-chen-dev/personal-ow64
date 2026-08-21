# 進度

更新於 2026-08-21。

共 10 個單元測試，`npm test` 可跑。

## 已完成

- Next.js 16 + TypeScript + Tailwind 骨架（`create-next-app`）。
- 領域核心：`lib/mandala.ts`（9×9 座標映射）、`lib/progress.ts`（三型態進度彙總），
  以及 `lib/domain.test.ts`。
- 資料層：Neon Postgres，`db/schema.ts` 四張表 + 初始 migration（`db/migrations/0000_*.sql`）。
  **Migration 尚未套用到任何實際的資料庫**，Neon 專案也還沒建立。
- 輸入驗證：`lib/schemas.ts`（Zod，照 decisions/0006 的規格）+ `lib/schemas.test.ts`。
- 寫入路徑：`app/actions.ts` 四個 server action（建立計劃表、存次目標、存行為、打卡），
  搭配 `db/queries.ts` 的讀取。次目標與行為用 upsert（靠 (planId, position) 與
  (subGoalId, position) 的唯一索引）；daily 的同日冪等在 `logProgress` 裡先查再寫。
- 畫面：`/` 建立與列出計劃表，`/plans/[id]` 是 9×9 格，每格內嵌表單可直接編輯與打卡。
  兩頁都是 `force-dynamic`。

## 尚未驗證（重要）

**以上寫入路徑從來沒有真的對資料庫跑過。** typecheck、lint、build、10 個單元測試都過，
但那些只涵蓋純函式與型別；SQL 是否正確、upsert 的 onConflict 是否命中、
server action 的表單流程是否順，都要等接上 Neon 才知道。

## 尚未開始

- 建立 Neon 專案、取得 `DATABASE_URL` 放進 `.env.local`、跑 `npm run db:migrate`。
  在這件事完成前，任何碰資料庫的程式碼都無法實際執行。
- Vercel 專案連結與環境變數設定。
- 視覺化：這是產品核心賣點，目前只有次目標格的一個百分比數字。
  至少要有次目標的 8 分進度環、行為層的熱力圖／趨勢圖。
- 帳號與多裝置同步——尚未決定要不要做，目前是單機單使用者。

## 下一步建議

接上 Neon 把寫入路徑實跑一遍（見「尚未驗證」）。確認資料進得去、讀得出來之後，
再開始做視覺化——在那之前圖表只能對著假資料做，做完常常要重來。
