---
name: precommit
description: Commit 前的檢查閘門，跑 lint、typecheck、測試，任一失敗就擋下
disable-model-invocation: true
context: fork
allowed-tools: Bash(npm run lint*) Bash(npm run typecheck*) Bash(npm test*) Bash(git status*) Bash(git diff*)
---

這是**檢查閘門，不是修理工**。你沒有寫檔權限，一個字都不要改，只負責跑檢查與回報。

依序執行，任何一項失敗就停下，不要繼續跑後面的：

1. `npm run lint`
2. `npm run typecheck`
3. `npm test`

## 回報格式

全過：回報 `PASS`，可以 commit。

有失敗：回報 `FAIL`，並列出失敗的項目名稱與原始輸出（錯誤訊息、檔案與行號），
不要自己判斷該怎麼修、也不要下修改指令——修正由主對話進行，修完重跑本 skill。

## 更重的檢查

`/code-review --fix` 與 `/security-review` 刻意不放在這裡：每次 commit 都跑會讓這個
閘門貴到被繞過，而被繞過的閘門比沒有閘門更危險。那兩個在推 PR 前或功能告一段落時手動跑。
