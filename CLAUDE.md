# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 這是什麼

Open Window 64（OW64）：個人用的曼陀羅計劃表（Mandal-Art）網頁 app。
使用者建立多份屬於自己的計劃表，把一個核心目標拆成 8 個次目標、再拆成 64 項具體行為，
建立後持續追蹤這 64 項的執行狀況。

## 目標與受眾

單一使用者為自己做長期目標管理，不是團隊協作工具，沒有分享、指派、留言這類需求。
使用者會反覆回來看自己的表，所以**回顧體驗就是產品本身**。

判斷取捨時的優先序：

1. 追蹤資料的正確與完整（歷史紀錄不能遺失或被覆蓋）
2. 回顧視覺化的表現力（圖像、圖表、互動；純文字清單是失敗的預設）
3. 填寫與打卡的順手程度
4. 其他

## 限制

- **視覺呈現是核心賣點，不是裝飾層。** 新功能如果只能以純文字清單呈現，
  先想清楚它的圖像形式再動手。
- **計劃表可以是未填滿的。** 使用者不會一次想出 64 項，任何邏輯都不能假設格子填滿了。
- 單機單使用者，目前沒有帳號系統，也不假設有網路。
- 個人專案，沒有 SLA、沒有多環境。不要為了規模而預先抽象。
- `tsconfig.json` 開了 `noUncheckedIndexedAccess`（陣列取值會是 `T | undefined`）。
  這是刻意的，81 格的索引存取全靠它擋。**不要為了消掉型別錯誤把它關掉**，
  正確做法是加邊界檢查並丟錯。
- 跨信任邊界的輸入一律用 Zod 驗證，規格見 `docs/decisions/0006-input-validation-zod.md`。

## Repo 架構

```
app/       Next.js App Router 的頁面與 route handler
lib/       領域核心，與框架無關的純函式
db/        Drizzle schema、連線、migration
docs/      決策與進度文件（見下）
```

`lib/` 裡有兩個「唯一來源」檔案，任何地方都不可以重寫一份：

- `lib/mandala.ts` — 9×9 的座標映射（哪一格是核心、次目標、第幾項行為）
- `lib/progress.ts` — 進度百分比的計算與彙總

改動這兩個檔之後 `npm test` 必須仍然通過。

## 指令

```
npm run dev          開發伺服器
npm run build        production build（含型別檢查）
npm run lint         ESLint
npm run typecheck    tsc --noEmit
npm test             領域核心測試（node:test）；跑單一測試：npm test -- --test-name-pattern '<名稱>'
npm run db:generate  改完 db/schema.ts 後產生 migration
npm run db:migrate   套用 migration
```

## Git 流程

**禁止在 `main` 上 commit。** 一律開分支做事。

開分支前先把 main 更新到最新，不要從舊的 main 長出分支：

```
git switch main && git pull
git switch -c feat/短描述
```

分支命名一個目的一個分支，前綴三選一：

- `feat/...` 新功能
- `fix/...` 修 bug
- `docs/...` 只動文件

一個分支只做一件事。發現做到一半跑題了，就把跑題的部分留到另一個分支。

## Commit 前流程

Commit 前一律先跑 `/precommit`，不要直接 `git commit`。

這個 skill 標了 `disable-model-invocation`，模型不能自己叫它。
所以要 commit 時，停下來請使用者輸入 `/precommit`，等回報 `PASS` 再 commit，
不要為了省事跳過或自己重跑一遍它的步驟。

它只檢查（lint / typecheck / test）不修東西。回報 `FAIL` 時由主對話修正，
修完再請使用者重跑一次，不要沒重跑就當作過了。

## 文件放哪裡

本檔只放大方向；細節一律落在 `docs/`，不要往這裡塞。

- `docs/domain.md` — 9×9 的結構規則、座標慣例，以及進度彙總的常設規則。
  **動任何格子或百分比相關的程式碼前先讀。**
- `docs/decisions/NNNN-標題.md` — 一檔一決策，含狀態、理由、後果。
  新決策就開新編號（不要重用已刪除的編號）。推翻舊決策時**不要刪掉舊檔**，
  把它的狀態改成「已被取代」並互相連結，新檔註明取代了誰。
  沒有索引檔，要看還有效的決策就 `grep -l '狀態：已採納' docs/decisions/*.md`。
- `docs/status.md` — 目前做到哪、還沒做什麼、下一步。完成一塊工作就直接覆寫。

三種文件各回答一個問題，不要互相重複：
**現在到哪裡**看 `status.md`（快照，會被覆寫）、**為什麼是這樣**看 `decisions/`
（只增不改，推翻就標記取代）、**怎麼變成這樣**看 `git log`（commit 訊息就是紀錄）。
所以 `status.md` 不需要保留歷史，也不要在裡面寫變更日誌。

`AGENTS.md` 由 `next dev` 自動產生維護，不要手改。
