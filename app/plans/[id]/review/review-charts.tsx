"use client";

import { useEffect, useRef } from "react";
import { useToday } from "@/app/use-today.ts";
import type { BoardAction, BoardSubGoal } from "@/lib/board.ts";
import { SLOTS } from "@/lib/mandala.ts";
import { coreFill, slotColor } from "@/lib/palette.ts";
import type { Action, Log } from "@/lib/progress.ts";
import { heatmapWeeks, monthlyTrend, trendPath, type HeatCell, type TrendPoint } from "@/lib/trend.ts";

type Props = {
  subGoals: BoardSubGoal[];
  actions: BoardAction[];
  /** 還在盤面上的行為的紀錄——趨勢用這份。 */
  logs: Log[];
  /** 含已封存格子的全部紀錄——年度熱圖用這份。 */
  allLogs: Log[];
};

const MONTHS = 12;
const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

export function ReviewCharts({ subGoals, actions, logs, allLogs }: Props) {
  const today = useToday();
  // SSR 時算不出當地日期，圖會全部畫錯位；等瀏覽器補上再畫。見 app/use-today.ts。
  if (!today) return <p className="text-sm text-dim">載入中…</p>;

  const overall = monthlyTrend(actions as Action[], logs, today, MONTHS);

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-medium">這一年的打卡</h2>
          <span className="text-xs text-dim">{allLogs.length} 筆紀錄，含已收起的格子</span>
        </div>
        <YearHeatmap logs={allLogs} today={today} />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-medium">整體趨勢</h2>
          <span className="text-xs text-dim">每個月底回看 30 天的達成率</span>
        </div>
        <TrendChart points={overall} color="var(--accent)" />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">八個次目標</h2>
        <div className="grid gap-x-6 gap-y-1 md:grid-cols-2">
          {Array.from({ length: SLOTS }, (_, slot) => {
            const sg = subGoals.find((s) => s.position === slot);
            const mine = sg ? actions.filter((a) => a.subGoalId === sg.id) : [];
            const points = monthlyTrend(mine as Action[], logs, today, MONTHS);
            return (
              <SubGoalRow
                key={slot}
                slot={slot}
                title={sg?.title ?? `次目標 ${slot + 1}`}
                filled={Boolean(sg)}
                points={points}
              />
            );
          })}
        </div>
        <p className="text-xs text-dim/80">
          折線是那個次目標底下所有行為的平均，信念型不列入計算。空白代表那一格還沒填。
        </p>
      </section>
    </div>
  );
}

/* ---------- 年度熱圖 ---------- */

const CELL = 10;
const PITCH = CELL + 2;
const TOP = 14; // 留給月份標籤

/** 打卡筆數換成熱力強度。1 筆就要明顯看得見，4 筆以上封頂。 */
function level(count: number): number | null {
  return count === 0 ? null : Math.min(1, 0.15 + count * 0.22);
}

function YearHeatmap({ logs, today }: { logs: Log[]; today: string }) {
  const weeks = heatmapWeeks(logs, today);
  const labels = monthLabels(weeks);
  const width = weeks.length * PITCH - 2;
  const height = TOP + 7 * PITCH - 2;

  // 手機上這張圖是橫向捲動的，預設要停在最右邊（最近）。桌機沒有溢出，這行不做事。
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [width]);

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      {/*
        53 週 × 7 天。桌機容器有 700 多 px，一格畫得出 10px；手機只有 340 px，
        整張縮下去每格剩 5px——那不是變小，是消失，一年的疏密看不出來。
        所以手機改成橫向捲動、格子維持原尺寸，而且**捲到最右邊**：
        回顧最先想看的是最近，不是去年的這個時候。
        桌機的 w-full 讓它照舊撐滿（minWidth 比容器窄，不影響）。
      */}
      <div ref={scroller} className="-mx-1 overflow-x-auto px-1">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ minWidth: width }}
          className="h-auto w-full"
          role="img"
          aria-label="這一年每天的打卡熱圖"
        >
        {weeks.map((week, w) => (
          <g key={w}>
            {labels[w] ? (
              <text x={w * PITCH} y={9} className="fill-dim" fontSize={9}>
                {labels[w]}
              </text>
            ) : null}
            {week.map((cell: HeatCell, d) => (
              <rect
                key={cell.day}
                x={w * PITCH}
                y={TOP + d * PITCH}
                width={CELL}
                height={CELL}
                rx={2}
                fill={coreFill(level(cell.count))}
                opacity={cell.future ? 0.35 : 1}
              >
                <title>{`${cell.day}　${cell.count} 次`}</title>
              </rect>
            ))}
          </g>
        ))}
        </svg>
      </div>
      <div className="mt-3 flex items-center justify-end gap-1.5 text-xs text-dim">
        <span>少</span>
        {[0, 1, 2, 3, 4].map((n) => (
          <span key={n} className="h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: coreFill(level(n)) }} />
        ))}
        <span>多</span>
      </div>
    </div>
  );
}

/**
 * 每個月只標一次，而且跟上一個標籤至少隔 3 欄——月初落在月底那一欄的時候，
 * 兩個標籤會擠在同一個位置上互相蓋掉。
 */
function monthLabels(weeks: HeatCell[][]): (string | null)[] {
  let last = -99;
  let prevMonth: string | null = null;
  return weeks.map((week, w) => {
    const month = week[0]?.day.slice(0, 7) ?? null;
    const isNew = month !== null && month !== prevMonth;
    prevMonth = month;
    if (!isNew || w - last < 3) return null;
    last = w;
    return `${Number(month!.slice(5))} 月`;
  });
}

/* ---------- 月趨勢 ---------- */

const W = 320;
const H = 100;

/**
 * 折線用 preserveAspectRatio="none" 撐滿容器寬度，線寬靠 non-scaling-stroke 維持；
 * 文字與圓點改用 HTML 疊在上面。SVG 裡的字會跟著 viewBox 一起放大，
 * 手機上剛好、桌機上就變成 27px 的巨大月份。
 */
function TrendChart({ points, color }: { points: TrendPoint[]; color: string }) {
  const path = trendPath(points, W, H);
  const last = points.at(-1)?.value ?? null;
  const x = (i: number) => (points.length > 1 ? (i / (points.length - 1)) * 100 : 0);

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="relative h-32 w-full">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
          role="img"
          aria-label={`每月達成率趨勢，目前 ${pct(last)}`}
        >
          {[0, 0.5, 1].map((g) => (
            <line
              key={g}
              x1={0}
              x2={W}
              y1={(1 - g) * H}
              y2={(1 - g) * H}
              stroke="var(--line)"
              strokeWidth={1}
              strokeDasharray={g === 0 ? undefined : "3 3"}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {path ? (
            <path
              d={path}
              fill="none"
              stroke={color}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
        </svg>
        {points.map((p, i) =>
          p.value === null ? null : (
            <span
              key={p.month}
              title={`${p.month}　${pct(p.value)}`}
              className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ left: `${x(i)}%`, top: `${(1 - p.value) * 100}%`, backgroundColor: color }}
            />
          ),
        )}
      </div>
      <div className="mt-2 flex justify-between text-xs text-dim">
        {points.map((p, i) =>
          i % 4 === 0 || i === points.length - 1 ? <span key={p.month}>{p.month.replace("-", "/")}</span> : null,
        )}
      </div>
      <p className="mt-2 text-xs text-dim">
        目前 <span className="font-medium tabular-nums" style={{ color }}>{pct(last)}</span>
        {path ? null : "・還沒有足以連成線的月份"}
      </p>
    </div>
  );
}

function SubGoalRow({
  slot, title, filled, points,
}: { slot: number; title: string; filled: boolean; points: TrendPoint[] }) {
  const color = slotColor(slot);
  const path = trendPath(points, 110, 24);
  const last = points.at(-1)?.value ?? null;

  return (
    <div className={`flex items-center gap-3 border-b border-line/60 py-2.5 ${filled ? "" : "opacity-50"}`}>
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="min-w-0 flex-1 truncate text-sm">{title}</span>
      <svg viewBox="0 0 110 24" className="h-6 w-[110px] shrink-0" aria-hidden>
        <line x1={0} x2={110} y1={24} y2={24} stroke="var(--line)" strokeWidth={1} />
        {path ? <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" /> : null}
      </svg>
      <span className="w-10 shrink-0 text-right text-xs tabular-nums text-dim">{pct(last)}</span>
    </div>
  );
}
