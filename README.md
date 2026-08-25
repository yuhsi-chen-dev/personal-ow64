# Open Window 64

個人用的曼陀羅計劃表（Mandal-Art）。把一個核心目標拆成 8 個次目標、再拆成 64 項具體行為，
然後每天回來把它們一格一格填滿。

**線上版：<https://personal-ow64.duckdns.org>**（用 Google 帳號登入即可使用）

---

## 這是什麼

曼陀羅計劃表是一張 9×9 的格子。中央那一格是你的核心目標，圍著它的 8 格是次目標；
每個次目標同時又是外圍某一塊的中心，那一塊剩下的 8 格就是它底下的具體行為。
8 × 8 = 64 項今天就做得到的事。

```
┌───────┬───────┬───────┐
│ a a a │ b b b │ c c c │
│ a A a │ b B b │ c C c │
│ a a a │ b b b │ c c c │
├───────┼───────┼───────┤
│ d d d │ A B C │ e e e │
│ d D d │ D * E │ e E e │
│ d d d │ F G H │ e e e │
├───────┼───────┼───────┤
│ f f f │ g g g │ h h h │
│ f F f │ g G g │ h H h │
│ f f f │ g g g │ h h h │
└───────┴───────┴───────┘

  *     核心目標
  A–H   8 個次目標（同一個次目標出現在兩個位置：中央區塊，以及自己那一塊的中心）
  a–h   該次目標底下的 8 項具體行為
```

**多租戶，但不是協作工具。** 很多個各自獨立的單人使用者，彼此看不到對方，
沒有分享、指派、留言、團隊。

**計劃表可以是未填滿的。** 沒有人會一次想出 64 項，所以任何邏輯都不假設格子填滿了。

## 功能

- **拆解** — 點開任何一塊就放大成焦點視圖（另有小地圖），點格子開側邊面板編輯。
- **AI 建議** — 輸入核心目標可以請 AI 拆出 8 個次目標；聚焦某一塊之後可以再請它想
  底下的 8 項行為（含追蹤方式）。建議以**虛線的幽靈格**落在盤面上，沒進資料庫，
  可以逐格改字、丟掉，按「全部採用」才寫入。
- **四種追蹤方式** — 一項行為不會只有一種「做完了」的意思：

  | 型態 | 意思 | 打卡長什麼樣 |
  |---|---|---|
  | `habit` | 每天／每週／每月做一次 | 「記一次」 |
  | `cumulative` | 做滿 N 次才算完成 | 「+1」，顯示 3/10 |
  | `milestone` | 一次性，完成就結束 | 「完成」 |
  | `mantra` | 只是要常看到的信念 | 沒有按鈕 |

- **今天頁** — 同一張 9×9，只把今天要做的格子點亮，其餘沉成底色，下面一顆大按鈕打卡。
- **回顧頁** — 年度打卡熱圖（53×7）、整體月趨勢折線，加上八個次目標各一條 sparkline。
  **全部手寫 SVG，沒有圖表套件。**
- **移除一格 ＝ 封存** — 有紀錄的格子只填 `archived_at`，紀錄留著；沒紀錄的才真的刪。
  所以調整計劃不會讓歷史消失。

## 技術

| | |
|---|---|
| 框架 | Next.js 16（App Router、Server Actions） + React 19 |
| 語言 | TypeScript（開了 `noUncheckedIndexedAccess`） |
| 樣式 | Tailwind CSS v4，設計 token 定義在 `app/globals.css` |
| 資料庫 | Neon Postgres + Drizzle ORM |
| 登入 | Auth.js v5 + Google，session 走 JWT（沒有 users／accounts／sessions 資料表） |
| AI | Google Gemini（`@google/genai`） |
| 驗證 | Zod，跨信任邊界的輸入一律過一次 |
| 測試 | `node:test`，不裝測試框架 |
| 部署 | Vercel |

圖表、狀態管理、UI 元件庫都沒有裝——盤面、熱圖、趨勢線全是手寫 SVG 與 CSS Grid。

## 跑起來

需要 Node.js 22+（測試用到 `--experimental-strip-types`）。

```bash
npm install
touch .env.local          # 照下表填
npm run db:migrate        # 套用 migration 到 .env.local 指的那個資料庫
npm run dev
```

`.env.local`：

| 變數 | 哪裡拿 | 沒設會怎樣 |
|---|---|---|
| `DATABASE_URL` | Neon 的連線字串 | 開不起來 |
| `AUTH_SECRET` | `npx auth secret` | 登入會壞 |
| `AUTH_GOOGLE_ID` | Google Cloud → OAuth 用戶端 | 登入會壞 |
| `AUTH_GOOGLE_SECRET` | 同上 | 登入會壞 |
| `GEMINI_API_KEY` | Google AI Studio | 只有 AI 建議那顆按鈕失效，其餘正常 |

Google OAuth 的重新導向 URI 要加 `http://localhost:3000/api/auth/callback/google`。
`AUTH_URL` 不用設——Auth.js 從 Host 推導。

### 指令

```bash
npm run dev          開發伺服器
npm run build        production build（含型別檢查）
npm run lint         ESLint
npm run typecheck    tsc --noEmit
npm test             測試；跑單一測試：npm test -- --test-name-pattern '<名稱>'
npm run db:generate  改完 db/schema.ts 後產生 migration
npm run db:migrate   套用 migration
```

`npm test` 分兩種：`lib/*.test.ts` 是純函式的單元測試，不碰資料庫；
`db/write-path.test.ts` 會**真的寫進 `DATABASE_URL` 指的資料庫**，請指向一條 dev branch。

## 專案結構

```
app/       Next.js App Router 的頁面、Server Actions、route handler
lib/       領域核心，與框架無關的純函式（測試都在這裡）
db/        Drizzle schema、連線、migration、寫入路徑
docs/      決策與進度文件
```

`lib/` 裡有兩個「唯一來源」檔案，任何地方都不可以重寫一份：

- `lib/mandala.ts` — 9×9 的座標映射（哪一格是核心、次目標、第幾項行為）
- `lib/progress.ts` — 進度百分比的計算與彙總

## 文件

README 只回答「這是什麼、怎麼跑」。其餘各有各的檔案，不互相重複：

| 想知道什麼 | 去哪裡看 |
|---|---|
| 9×9 的結構規則、座標慣例、進度彙總的常設規則 | [`docs/domain.md`](docs/domain.md) |
| 為什麼是這樣 | [`docs/decisions/`](docs/decisions/)（一檔一決策，只增不改，推翻就標記取代） |
| 現在做到哪、還欠什麼 | [`docs/status.md`](docs/status.md) |
| 上線要怎麼做 | [`docs/deploy.md`](docs/deploy.md) |
| 怎麼變成這樣 | `git log` |

要看還有效的決策：`grep -l '狀態：已採納' docs/decisions/*.md`

## 幾條開發時的鐵則

- **擁有權落在寫入層，不是只在查詢層。** 只在讀取端過濾 `userId` 擋不住「直接 POST
  別人的 id」。`db/writes.ts` 的每一支都吃 `userId` 且寫進 `WHERE`，讓「不帶使用者
  就寫得進去」在型別上不可能。見 [`decisions/0011`](docs/decisions/0011-multi-tenant.md)。
- **不要為了消掉型別錯誤關掉 `noUncheckedIndexedAccess`。** 81 格的索引存取全靠它擋，
  正確做法是加邊界檢查並丟錯。
- **改過 `lib/mandala.ts` 或 `lib/progress.ts` 之後 `npm test` 必須仍然通過。**
- **改過 `db/schema.ts` 的 PR，merge 完要自己對 production 跑一次 `db:migrate`。**
  它沒掛在 build 上，Vercel 會照樣部署成功，然後線上報 column 不存在。

## 這是個人專案

沒有 roadmap，也沒有要做成產品。issue 可以開，但不保證會處理。

## 授權

[MIT](LICENSE)
