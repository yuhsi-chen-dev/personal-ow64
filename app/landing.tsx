import Link from "next/link";
import { ArrowRight, ChevronDown, LayoutGrid, LogIn, ShieldCheck } from "lucide-react";
import { SIZE, layout } from "@/lib/mandala.ts";
import { coreFill, slotColor, slotFill } from "@/lib/palette.ts";
import { signInWithGoogle } from "./auth-actions.ts";
import { ThemeToggle } from "./theme-toggle.tsx";

/**
 * 未登入時的首頁。**這頁的存在是硬性要求，不是行銷**：Google 的品牌驗證會退回
 * 「首頁必須登入才能瀏覽」的應用程式，而審查看的是內容而不是狀態碼——
 * 一頁只寫著「請先登入」的公開頁面，讀起來仍然是一面登入牆。
 * 所以這裡要講清楚它是什麼、會拿到什麼資料，並連得到隱私權政策與服務條款。
 *
 * 視覺上它同時是產品的第一印象：`CLAUDE.md` 說視覺呈現是核心賣點，
 * 那麼入口頁就不能是一段純文字說明——底下那幾張圖用的是產品本身的色票與版型
 * （`lib/palette.ts` 與 9×9 的座標），所以它展示的就是真的長那樣，不是示意的假圖。
 *
 * 中文不要在 JSX 裡跨行寫，換行會被當成一個半形空白留在句子中間——
 * 除非那個換行落在標籤邊界上（`>` 或 `<` 旁邊），那樣不會產生空白。
 *
 * 標點的原則：**標題裡不要用逗號**。逗號代表句子還沒完，吊在行尾會把標題讀成散文；
 * 而且 CSS 不知道中文的詞在哪裡斷（「看得到」會被切成「看／得到」），
 * 長標題折行永遠是賭運氣。所以標題一律改寫成短到不會折行的斷言句，
 * 要停頓就用句號或換行，不要用逗號把兩個子句黏起來。
 * 內文段落不受這條限制，該有的標點照寫。
 */

/**
 * 示意盤面的填色。固定算出來的假資料，不連資料庫；留幾格空的，因為表本來就可以沒填滿。
 * 次目標刻意畫得比行為亮——不然 81 格會看起來像一片雜訊，看不出中央那個十字結構。
 */
function demoFill(kind: "core" | "subGoal" | "action", slot: number, i: number): string {
  if (kind === "core") return coreFill(0.92);
  if (kind === "subGoal") return slotFill(slot, 0.82);
  if ((i * 7) % 11 === 0) return slotFill(slot, null);
  return slotFill(slot, 0.18 + ((i * 37) % 9) / 20);
}

/**
 * 首頁那張 9×9。純視覺，沒有互動——真正的盤面在登入之後。
 * `focus` 只留一個區塊有顏色，其餘沉下去，用來說明「點一塊會放大」那件事。
 */
function DemoBoard({ focus, className = "" }: { focus?: number; className?: string }) {
  const cells = layout();
  return (
    <div aria-hidden className={`grid aspect-square grid-cols-3 gap-1.5 ${className}`}>
      {Array.from({ length: 9 }, (_, block) => {
        const dimmed = focus !== undefined && block !== focus;
        return (
          <div
            key={block}
            className="grid grid-cols-3 gap-px overflow-hidden rounded-lg transition-opacity duration-500"
            style={dimmed ? { opacity: 0.22 } : undefined}
          >
            {Array.from({ length: 9 }, (_, k) => {
              const row = Math.floor(block / 3) * 3 + Math.floor(k / 3);
              const col = (block % 3) * 3 + (k % 3);
              const cell = cells[row * SIZE + col];
              if (!cell) throw new RangeError(`示意盤面少了格子 ${row},${col}`);
              return (
                <div
                  key={k}
                  className="aspect-square"
                  style={{
                    backgroundColor: demoFill(
                      cell.kind,
                      cell.kind === "core" ? 0 : cell.subGoal,
                      row * SIZE + col,
                    ),
                  }}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/** 回顧頁那張年度熱圖的縮小版：20 週 × 7 天。 */
function DemoHeatmap() {
  return (
    <svg aria-hidden viewBox="0 0 200 68" className="w-full">
      {Array.from({ length: 20 }, (_, w) =>
        Array.from({ length: 7 }, (_, d) => {
          const n = (w * 7 + d) * 13;
          const level = n % 5;
          return (
            <rect
              key={`${w}-${d}`}
              x={w * 10}
              y={d * 9.7}
              width={8}
              height={8}
              rx={2}
              fill={
                level === 0
                  ? "var(--surface-2)"
                  : `color-mix(in oklab, var(--accent) ${level * 24}%, var(--surface))`
              }
            />
          );
        }),
      )}
    </svg>
  );
}

/** 八個次目標各一條走勢線。點是固定的，只是把「回顧長這樣」畫出來。 */
function DemoTrends() {
  const shape = [0.12, 0.3, 0.24, 0.48, 0.4, 0.66, 0.72, 0.92];
  return (
    <div aria-hidden className="grid grid-cols-2 gap-x-4 gap-y-3">
      {Array.from({ length: 8 }, (_, slot) => (
        <div key={slot} className="flex items-center gap-2">
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: slotColor(slot) }}
          />
          <svg viewBox="0 0 100 24" className="h-6 w-full" preserveAspectRatio="none">
            <polyline
              fill="none"
              stroke={slotColor(slot)}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              points={shape
                .map((v, i) => {
                  const jitter = ((slot * 13 + i * 29) % 7) / 9 - 0.35;
                  const y = 22 - Math.min(0.97, Math.max(0.05, v + jitter * (1 - v))) * 20;
                  return `${(i / (shape.length - 1)) * 100},${y.toFixed(1)}`;
                })
                .join(" ")}
            />
          </svg>
        </div>
      ))}
    </div>
  );
}

/** AI 建議落在盤面上的樣子：虛線的幽靈格，還沒進資料庫，可以逐格改字或整組丟掉。 */
function DemoGhosts() {
  return (
    <div aria-hidden className="flex flex-col gap-5">
      <div className="grid grid-cols-3 gap-1.5">
        {Array.from({ length: 9 }, (_, k) =>
          k === 4 ? (
            <div
              key={k}
              className="grid aspect-square place-items-center rounded-lg text-[0.65rem] font-medium text-black/70"
              style={{ backgroundColor: slotColor(3, { dim: true }) }}
            >
              次目標
            </div>
          ) : (
            <div
              key={k}
              className="flex aspect-square flex-col justify-center gap-1.5 rounded-lg border border-dashed border-line bg-surface-2/60 p-2.5"
            >
              <span className="h-1 rounded-full bg-line" />
              <span className="h-1 w-2/3 rounded-full bg-line" />
            </div>
          ),
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-accent px-3.5 py-1.5 text-xs font-medium text-black">全部採用</span>
        <span className="rounded-full border border-line px-3.5 py-1.5 text-xs text-dim">逐格改字</span>
        <span className="rounded-full border border-line px-3.5 py-1.5 text-xs text-dim">丟掉</span>
      </div>
    </div>
  );
}

const TRACKING = [
  { name: "習慣", note: "每天／每週／每月做一次" },
  { name: "累計", note: "做滿 N 次才算完成" },
  { name: "里程碑", note: "一次性，完成就結束" },
  { name: "信念", note: "只看，不打卡" },
] as const;

/** 大字＋說明＋一張圖的區塊。三個功能共用一個版型，不要各寫一份。 */
function Feature({
  eyebrow,
  title,
  body,
  visual,
  flip = false,
}: {
  eyebrow: string;
  title: string;
  /** 一句一行。長段落請先想清楚哪一句可以刪掉，不要靠讀者自己斷句。 */
  body: readonly string[];
  visual: React.ReactNode;
  flip?: boolean;
}) {
  return (
    <div
      className={`reveal flex flex-col items-center gap-8 md:gap-14 ${flip ? "md:flex-row-reverse" : "md:flex-row"}`}
    >
      <div className="flex flex-col gap-4 md:flex-1">
        <span className="text-xs font-medium tracking-[0.14em] text-accent-text uppercase">
          {eyebrow}
        </span>
        {/* 中文的字面比拉丁字母飽滿，行距要比英文標題鬆才不會黏在一起 */}
        <h2 className="display text-[1.75rem] leading-[1.45] font-semibold text-balance sm:text-3xl md:text-[2.25rem] md:leading-[1.3]">
          {title}
        </h2>
        <div className="flex flex-col gap-1.5 leading-[1.9] text-dim text-pretty">
          {body.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </div>
      <div className="w-full max-w-sm md:max-w-none md:flex-1">
        <div className="rounded-3xl border border-line bg-surface p-6 shadow-[var(--shadow)] sm:p-8">
          {visual}
        </div>
      </div>
    </div>
  );
}

const CTA_CLASS =
  "lift inline-flex min-h-12 items-center gap-2 rounded-full bg-accent px-7 text-[0.95rem] font-medium text-black cursor-pointer";

/** 主要行動鈕。已經登入的人不需要再看到「用 Google 登入」，直接給他進去的門。 */
function Cta({ signedIn, label }: { signedIn: boolean; label: string }) {
  if (signedIn) {
    return (
      <Link href="/dashboard" className={CTA_CLASS}>
        <LayoutGrid size={16} />
        進入我的計劃表
      </Link>
    );
  }
  return (
    <form action={signInWithGoogle}>
      <button type="submit" className={CTA_CLASS}>
        <LogIn size={16} />
        {label}
      </button>
    </form>
  );
}

export function Landing({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="flex w-full flex-col">
      {/* 頂條：只有主題切換。登入的入口在下面那顆大的，不要在這裡也放一顆搶它。 */}
      <header className="sticky top-0 z-10 border-b border-line/60 bg-bg/75 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-3 sm:px-8">
          <span className="display text-sm font-semibold tracking-tight">
            Open Window <span className="text-accent-text">64</span>
          </span>
          <div className="flex items-center gap-2">
            {signedIn ? (
              <Link
                href="/dashboard"
                className="lift inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-xs text-dim hover:text-text"
              >
                <LayoutGrid size={13} />
                我的計劃表
              </Link>
            ) : null}
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="flex w-full flex-col">
        {/* ── 主視覺 ───────────────────────────────────────── */}
        <section className="relative overflow-hidden px-5 pt-16 pb-20 sm:px-8 md:pt-28 md:pb-32">
          {/* 盤面後面那團光。純裝飾，用 accent 混出來，換主題會自己跟著走。 */}
          <div
            aria-hidden
            className="breathe pointer-events-none absolute top-1/3 left-1/2 -z-10 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/3 rounded-full opacity-60 blur-[90px]"
            style={{
              background:
                "radial-gradient(closest-side, color-mix(in oklab, var(--accent) 42%, transparent), transparent)",
            }}
          />
          <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-7 text-center">
            <span className="rise inline-flex items-center rounded-full border border-line bg-surface/70 px-3.5 py-1.5 text-xs tracking-wide text-dim backdrop-blur">
              曼陀羅計劃表 · Mandal-Art
            </span>
            <h1 className="rise display text-[clamp(2.5rem,10vw,4.75rem)] leading-[1.18] font-semibold tracking-[-0.03em] text-balance md:leading-[1.08]" style={{ "--d": "0.07s" } as React.CSSProperties}>
              {/*
                句號不是逗號：中文的大標點在行尾要讀起來是「收」，不是「還沒說完」。
                只在第一句放句號當節拍，最後一句不收尾——結尾的句號會在大字底下拖一塊空白。
              */}
              一個目標。
              <br className="sm:hidden" />
              <span className="bg-gradient-to-br from-accent to-[oklch(0.68_0.17_232)] bg-clip-text text-transparent">
                64 個動作
              </span>
            </h1>
            <p className="rise max-w-xl text-base leading-[1.9] text-dim text-pretty sm:text-lg sm:leading-[1.75] md:text-xl" style={{ "--d": "0.14s" } as React.CSSProperties}>
              {/*
                一句一行。既然換行已經是斷句，行尾就不要再放逗號句號——置中排版下那些標點會把行拉歪。
                每一行都要短到手機上放得下：一行折成兩行、末尾吊一個「行為」在中間，比長句還難看。
              */}
              <span className="block">把想了很久卻沒開始的那件事</span>
              <span className="block">拆成 8 個次目標、64 項行為</span>
              <span className="block">然後一格一格把它填滿</span>
            </p>
            <div className="rise flex flex-col items-center gap-3" style={{ "--d": "0.21s" } as React.CSSProperties}>
              <Cta signedIn={signedIn} label="用 Google 登入" />
              {/* 「免費使用」是講給還沒進來的人聽的，已經登入的人不需要再被推銷一次 */}
              {signedIn ? null : (
                <p className="text-xs text-dim">免費使用 · 你的計劃表只有你看得到</p>
              )}
            </div>
          </div>

          <div className="rise mx-auto mt-14 w-full max-w-md md:mt-20" style={{ "--d": "0.3s" } as React.CSSProperties}>
            <div className="rounded-[1.75rem] border border-line bg-surface/80 p-3 shadow-[var(--shadow)] backdrop-blur-xl sm:p-4">
              <DemoBoard />
            </div>
            <p className="mt-4 text-center text-xs text-dim">
              9×9＝81 格：中央是核心目標與 8 個次目標，外圈是它們各自的 8 項行為
            </p>
          </div>

          <div className="mt-14 flex justify-center text-dim md:mt-20">
            <ChevronDown size={20} aria-hidden />
          </div>
        </section>

        {/* ── 數字 ─────────────────────────────────────────── */}
        <section className="border-y border-line bg-surface-2/60 px-5 py-12 sm:px-8 md:py-16">
          <div className="reveal mx-auto grid w-full max-w-3xl grid-cols-3 gap-4 text-center">
            {[
              { n: "1", label: "個核心目標" },
              { n: "8", label: "個次目標" },
              { n: "64", label: "項具體行為" },
            ].map(({ n, label }) => (
              <div key={label} className="flex flex-col gap-1.5">
                <span className="display text-4xl font-semibold tracking-[-0.03em] sm:text-5xl md:text-6xl">
                  {n}
                </span>
                <span className="text-xs text-dim sm:text-sm">{label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── 三個功能 ─────────────────────────────────────── */}
        <section className="mx-auto flex w-full max-w-5xl flex-col gap-20 px-5 py-20 sm:px-8 md:gap-28 md:py-28">
          <Feature
            eyebrow="拆解"
            title="每一塊都是下一張 9×9"
            body={[
              "核心目標放中間，8 個次目標圍著它。",
              "每一個次目標底下，再展開 8 項具體行為。",
              "沒想到的格子先空著——這張表本來就允許沒填滿。",
            ]}
            visual={<DemoBoard focus={2} className="w-full" />}
          />
          <Feature
            flip
            eyebrow="AI 建議"
            title="卡住就讓 AI 先拆一次"
            body={[
              "想不出 8 個次目標，就把核心目標交給 AI 拆一次。",
              "建議以虛線的幽靈格落在盤面上，還沒進資料庫。",
              "逐格改字、丟掉、或按「全部採用」——你決定。",
            ]}
            visual={<DemoGhosts />}
          />
          <Feature
            eyebrow="打卡"
            title="每天只看今天那幾格"
            body={[
              "今天該做的格子亮起來，其餘沉成底色。",
              "一顆按鈕，打完卡。",
              "習慣、累計、里程碑、信念，四種追蹤方式各有各的判準。",
            ]}
            visual={
              <div className="flex flex-col gap-3">
                {TRACKING.map(({ name, note }) => (
                  <div
                    key={name}
                    className="flex items-center justify-between gap-3 rounded-xl border border-line bg-bg px-4 py-3"
                  >
                    <span className="text-sm font-medium">{name}</span>
                    <span className="text-right text-xs text-dim">{note}</span>
                  </div>
                ))}
              </div>
            }
          />
          <Feature
            flip
            eyebrow="回顧"
            title="看得到自己走了多遠"
            body={[
              "年度熱圖、月趨勢，八個次目標各一條走勢線。",
              "收起來的格子，紀錄仍然留著。",
            ]}
            visual={
              <div className="flex flex-col gap-6">
                <DemoHeatmap />
                <div className="h-px bg-line" />
                <DemoTrends />
              </div>
            }
          />
        </section>

        {/* ── 資料與隱私 ───────────────────────────────────── */}
        <section className="border-t border-line bg-surface-2/60 px-5 py-16 sm:px-8 md:py-20">
          <div className="reveal mx-auto flex w-full max-w-2xl flex-col gap-4">
            <h2 className="flex items-center gap-2 text-lg leading-snug font-medium">
              <ShieldCheck size={18} className="shrink-0 text-accent-text" />
              登入會拿到你的什麼
            </h2>
            <div className="flex flex-col gap-1.5 leading-[1.9] text-dim text-pretty">
              <p>只有 Google 帳號最基本的個人資料與 email，用來認出「這些表是你的」。</p>
              <p>不讀你的信件、雲端硬碟或聯絡人，沒有分析工具，也沒有廣告追蹤。</p>
              <p>按下 AI 建議時，只有那一段目標文字會送到 Google 的 Gemini，不按就不會送。</p>
              <p>這裡不是協作工具——別人看不到你的任何內容。</p>
            </div>
            <Link
              href="/privacy"
              target="_blank"
              className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm text-accent-text hover:underline hover:underline-offset-4"
            >
              看完整的隱私權政策
              <ArrowRight size={14} />
            </Link>
          </div>
        </section>

        {/* ── 收尾 ─────────────────────────────────────────── */}
        <section className="px-5 py-20 text-center sm:px-8 md:py-28">
          <div className="reveal mx-auto flex w-full max-w-xl flex-col items-center gap-6">
            <h2 className="display text-[clamp(1.75rem,6vw,2.75rem)] leading-[1.35] font-semibold tracking-[-0.02em] text-balance md:leading-[1.2]">
              從第一格開始
            </h2>
            <Cta signedIn={signedIn} label="用 Google 登入，開始第一張" />
          </div>
        </section>
      </main>

      <footer className="border-t border-line px-5 py-8 sm:px-8">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-1 text-sm text-dim">
          <span className="mr-auto">Open Window 64</span>
          <Link href="/privacy" target="_blank" className="min-h-11 content-center hover:text-text">
            隱私權政策
          </Link>
          <Link href="/terms" target="_blank" className="min-h-11 content-center hover:text-text">
            服務條款
          </Link>
        </div>
      </footer>
    </div>
  );
}
