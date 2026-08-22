# 進度

更新於 2026-08-22。

**這個檔是快照，只回答「現在到哪裡」，會被直接覆寫。**
歷史不在這裡：想看它怎麼變的用 `git log -p docs/status.md`，
想知道為什麼變成這樣看 `decisions/`。

共 12 個單元測試，`npm test` 可跑。

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

寫入路徑已在真實資料庫上走過一遍（2026-08-22），以下都是查資料庫確認、不是看畫面：

- **結構**：4 張表與兩個唯一索引實際存在。
- **讀取**：`getDb()` 的 lazy 連線、`loadPlan()`、`rollup()` 對真實資料實跑成功，
  進度數字正確（1 筆 daily ÷ 30 天 = 3%）。
- **寫入**：建立計劃表、存次目標、存行為、打卡，四件都寫得進去。
- **upsert**：同一格改標題再存，該列被更新而非新增，`onConflictDoUpdate` 確實命中唯一索引。
- **同日冪等**：同一天第二次打卡沒有新增紀錄，時間戳維持第一次的。

過程中抓到兩個 bug，都已修掉：非 count 型的行為被目標欄位擋下（錯誤訊息還漏出 Zod 原文），
以及打卡日期用 UTC 算導致跨時區記錯天。

## 仍未驗證

- **視覺與 UX 完全沒驗過**，而且目前的畫面是失敗的（見下）。
- `count` 與 `percent` 兩種 trackingType 只有單元測試，沒有在真實資料庫上打過卡。
- 部署後的行為（Vercel 上的 server action、環境變數、冷啟）。

## 尚未開始

- Vercel 專案連結與環境變數設定。
- **重做畫面**（下一件事）。目前 `/plans/[id]` 是一張由 73 個表單控制項組成的試算表，
  9×9 的結構完全看不出來——而曼陀羅表的全部價值就在那個結構。
  這違反 CLAUDE.md 自己寫的「純文字清單是失敗的預設」。
  方向：格子只負責看（標題 + 進度視覺、3×3 區塊界線清楚），
  點格子才進入編輯，打卡獨立成一個明確的動作。
- 視覺化：次目標的 8 分進度環、行為層的熱力圖／趨勢圖。
- 帳號與多裝置同步——尚未決定要不要做，目前是單機單使用者。

## 下一步建議

重做 `/plans/[id]` 的畫面。寫入路徑已經證明可用，現在擋路的是它不能看。
