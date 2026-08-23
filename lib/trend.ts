// 跨月回顧的資料層。純函式，不碰 React 也不碰資料庫，所以趨勢的數字測得到。
// 百分比一律經過 lib/progress.ts 的 rollup，這裡不重寫任何公式。
import { endOfMonth, lastPeriods, shiftDay, startOfWeek } from "./day.ts";
import { rollup, type Action, type Log } from "./progress.ts";

/** 統計區間固定 30 天：趨勢是「當時的一個月狀態」，跟使用者在盤面上選的區間無關。 */
const TREND_WINDOW = 30;

/** 每一天的打卡筆數。年度熱圖的資料來源。 */
export function dailyCounts(logs: Log[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of logs) m.set(l.day, (m.get(l.day) ?? 0) + 1);
  return m;
}

export type HeatCell = { day: string; count: number; future: boolean };

/**
 * 年度熱圖的格子：每一欄是一週（週一在最上面），由舊到新，最後一欄含今天。
 * 今天之後的格子照樣回傳，但標成 future——版面要維持方正，不能少畫幾格。
 */
export function heatmapWeeks(logs: Log[], today: string, weeks = 53): HeatCell[][] {
  const counts = dailyCounts(logs);
  const first = shiftDay(startOfWeek(today), -(weeks - 1) * 7);
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const day = shiftDay(first, w * 7 + d);
      return { day, count: counts.get(day) ?? 0, future: day > today };
    }),
  );
}

export type TrendPoint = { month: string; value: number | null };

/**
 * 每個月底回看 30 天的達成率，由舊到新。
 *
 * 紀錄要先砍到那個月底為止再交給 rollup：累計型與里程碑型**不篩區間**
 * （見 decisions/0008），不砍的話今天完成的目標會讓 12 個月全部是 100%。
 */
export function monthlyTrend(actions: Action[], logs: Log[], today: string, months = 12): TrendPoint[] {
  return lastPeriods(today, "monthly", months).map((month) => {
    const end = endOfMonth(month) > today ? today : endOfMonth(month);
    const scoped = logs.filter((l) => l.day <= end);
    return { month, value: rollup(actions, scoped, { rangeDays: TREND_WINDOW, today: end }) };
  });
}

/** 趨勢折線的 SVG path。value 為 null 的點跳過；不足兩點回傳空字串（畫不出線）。 */
export function trendPath(points: TrendPoint[], width: number, height: number): string {
  const usable = points.map((p, i) => ({ i, v: p.value })).filter((p): p is { i: number; v: number } => p.v !== null);
  if (usable.length < 2) return "";
  const step = points.length > 1 ? width / (points.length - 1) : 0;
  return usable
    .map(({ i, v }, n) => `${n === 0 ? "M" : "L"}${(i * step).toFixed(1)} ${((1 - v) * height).toFixed(1)}`)
    .join(" ");
}
