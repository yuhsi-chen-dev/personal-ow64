# 進度

更新於 2026-08-21。

**這個檔是快照，只回答「現在到哪裡」，會被直接覆寫。**
歷史不在這裡：想看它怎麼變的用 `git log -p docs/status.md`，
想知道為什麼變成這樣看 `decisions/`。

共 10 個單元測試，`npm test` 可跑。

## 已完成

- Next.js 16 + TypeScript + Tailwind 骨架（`create-next-app`）。
- 領域核心：`lib/mandala.ts`（9×9 座標映射）、`lib/progress.ts`（三型態進度彙總），
  以及 `lib/domain.test.ts`。
- 資料層：Neon Postgres，`db/schema.ts` 四張表 + 初始 migration，已套用到 Neon。
- 輸入驗證：`lib/schemas.ts`（Zod，照 decisions/0006 的規格）+ `lib/schemas.test.ts`。
- 寫入路徑：`app/actions.ts` 四個 server action（建立計劃表、存次目標、存行為、打卡），
  搭配 `db/queries.ts` 的讀取。次目標與行為用 upsert（靠 (planId, position) 與
  (subGoalId, position) 的唯一索引）；daily 的同日冪等在 `logProgress` 裡先查再寫。
- 畫面：`/` 建立與列出計劃表，`/plans/[id]` 是 9×9 格，每格內嵌表單可直接編輯與打卡。
  兩頁都是 `force-dynamic`。

## 已驗證到哪

- **結構**：migration 已套用到 Neon，4 張表與兩個唯一索引都實際查詢確認存在。
- **讀取**：`getDb()` 的 lazy 連線與 `listPlans()` 對真實資料庫實跑成功。
- **寫入：還沒有。** `onConflictDoUpdate` 有沒有命中唯一索引、`logProgress` 的
  daily 同日冪等對不對、server action 與表單的流程順不順，都還是未知。
  單元測試涵蓋的是純函式與型別，這些都碰不到。

## 尚未開始

- Vercel 專案連結與環境變數設定。
- 視覺化：這是產品核心賣點，目前只有次目標格的一個百分比數字。
  至少要有次目標的 8 分進度環、行為層的熱力圖／趨勢圖。
- 帳號與多裝置同步——尚未決定要不要做，目前是單機單使用者。

## 下一步建議

用瀏覽器把寫入路徑走一遍：建計劃表 → 填次目標 → 填行為 → 打卡兩次（驗冪等）。
確認資料真的進得去之後，再開始做視覺化——在那之前圖表只能對著假資料做，
做完常常要重來。
