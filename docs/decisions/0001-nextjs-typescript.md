# 0001. 應用框架：Next.js（App Router）+ TypeScript

- 狀態：已採納
- 日期：2026-08-21

## 決策

單一 repo、前後端同一個服務，資料存取走 server component / route handler，
不另開獨立 API 服務。

## 理由

個人用途的 app，多養一個後端服務不划算。Next.js 一個框架涵蓋頁面渲染與伺服器端邏輯。

## 後果

Next.js 沒有 ORM、背景任務、job queue、排程，這些要另外接。
之後如果要做「每天提醒打卡」這類事情，得另找地方跑排程。

Next 版本比多數模型的訓練資料新，API 與慣例可能不同。
寫任何 Next 相關程式碼前先看 `AGENTS.md` 指的 `node_modules/next/dist/docs/`。

Runtime 一律用 Node.js，地端與雲端一致。評估過 Bun（內建 sqlite 與 TS、安裝快），
但 Next.js 官方支援的是 Node，且 Vercel 上跑的也是 Node，
本機換 Bun 會造成地端／雲端 runtime 不一致，不划算。
