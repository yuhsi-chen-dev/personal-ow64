# 0006. 輸入驗證用 Zod

- 狀態：已採納，**尚未實作**（目前沒有任何輸入路徑，因此還沒安裝 `zod`）
- 日期：2026-08-21

## 決策

所有跨信任邊界進來的資料，在進入領域邏輯或資料庫之前，一律先用 Zod schema `parse`。
驗證失敗就回傳錯誤，不要試圖修補或塞預設值蒙混過去。

信任邊界包括：

- route handler 與 server action 收到的 request body、表單資料
- URL query string 與動態路由參數
- 從檔案匯入的計劃表 JSON
- 任何從瀏覽器 storage 讀回來的東西（使用者可以手改）

**不包括**內部函式之間的呼叫。`lib/` 裡的純函式假設輸入已經驗證過，
不要在每一層重複 parse。

## 為什麼需要（TypeScript 不夠）

TypeScript 只在編譯期存在，執行期完全不管。使用者送進來的 JSON 標成 `Action`
不代表它真的是 `Action`。`noUncheckedIndexedAccess` 這類設定擋的是我們自己的
索引錯誤，擋不住外部資料。

## 驗證規格

實作時照這張表，欄位語意見 `../domain.md` 與 [0003](0003-hybrid-tracking.md)。

| 欄位 | 規則 |
|---|---|
| `plan.title` | 非空字串，去頭尾空白後長度 1..200 |
| `subGoal.position` | 整數 0..7 |
| `action.position` | 整數 0..7 |
| `*.title` | 同 `plan.title` |
| `action.trackingType` | enum `daily` \| `count` \| `percent` |
| `action.target` | 僅 `count` 型允許且必填，正整數；其餘型態必須是 `null` |
| `log.day` | `YYYY-MM-DD`，且必須是真實存在的日期（不能是 2026-02-30） |
| `log.value` | 有限數；`daily` 恆為 1，`count` 為正數，`percent` 為 0..100 |

兩條跨欄位規則要用 `superRefine` 或 discriminated union 表達，
**不要拆成兩次獨立驗證**：

1. `target` 的必填與否取決於 `trackingType`
2. `log.value` 的合法範圍取決於該 action 的 `trackingType`

## 後果

- 輸入 schema 與 `db/schema.ts` 不是同一份東西（輸入沒有 `id`、`createdAt`，
  但有上面那些額外規則）。可以評估 `drizzle-zod` 從資料表衍生基底再 refine，
  但不要為了共用而把上面的規則稀釋掉。
- Zod schema 放 `lib/schemas.ts`，與 `lib/mandala.ts`、`lib/progress.ts` 同層，
  一樣是框架無關的純邏輯。
- 真的開始寫輸入路徑時才 `npm i zod`。現在裝一個沒有任何呼叫點的依賴沒有意義。
