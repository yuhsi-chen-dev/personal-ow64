# 0002. 資料層：Drizzle ORM + SQLite（better-sqlite3）

- 狀態：**已被取代**，見 [0005](0005-deploy-vercel-neon.md)
- 日期：2026-08-21

## 決策

用 Drizzle ORM，資料存本機 SQLite 檔，driver 用 better-sqlite3。

## 理由

需要的是 typed schema、migration、以及換 dialect 的退路，
這三件不是幾行能自己寫的，值得一個依賴。SQLite 則是零設定。

## 為什麼被取代

SQLite 是本機檔案，而 Vercel／Netlify 這類 serverless 平台的檔案系統是暫時的，
寫進去的打卡紀錄下一個請求就不見了。決定要部署之後這個選型就不成立。

**Drizzle 的部分沒有被推翻**，只有底層資料庫換掉。當初刻意不寫 SQLite 專屬 SQL，
就是為了留這條退路，實際換的時候只動了 `db/schema.ts` 與 `db/index.ts`。
