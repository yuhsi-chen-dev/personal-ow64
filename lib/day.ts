/**
 * 使用者當地的日曆日 'YYYY-MM-DD'。
 *
 * 不可以用 toISOString().slice(0,10)——那是 UTC。UTC+8 的使用者在當地
 * 凌晨 0..8 點打卡會被記成前一天，而且錯得很安靜：連續天數莫名斷掉。
 * 見 docs/decisions/0004-single-log-table.md。
 */
export function localDay(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 以當地日曆推移天數。跨月、跨年、閏日都交給 Date 自己算，不要自己加減。 */
export function shiftDay(day: string, delta: number): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return localDay(new Date(y, m - 1, d + delta));
}

/** 含今天在內的最近 n 天，由舊到新。 */
export function lastDays(today: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => shiftDay(today, i - n + 1));
}

export type Cadence = "daily" | "weekly" | "monthly";

/** 該週的星期一。用來把同一週的打卡歸成一組。 */
export function startOfWeek(day: string): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const dow = (new Date(y, m - 1, d).getDay() + 6) % 7; // 星期一 = 0
  return shiftDay(day, -dow);
}

/**
 * 把一個日期歸到它所屬的週期。同一週期內重複打卡只算一次，
 * 「每週跑一次」才不會因為某週跑了三次就灌水。
 */
export function periodKey(day: string, cadence: Cadence): string {
  if (cadence === "daily") return day;
  if (cadence === "weekly") return startOfWeek(day);
  return day.slice(0, 7); // YYYY-MM
}

/** 統計區間內「應該」達成幾次。這是習慣型進度的分母。 */
export function expectedPeriods(rangeDays: number, cadence: Cadence): number {
  const perPeriod = cadence === "daily" ? 1 : cadence === "weekly" ? 7 : 30;
  return Math.max(1, Math.ceil(rangeDays / perPeriod));
}

/** 統計區間內的日期嗎？區間是「含今天往回數 rangeDays 天」。 */
export function inWindow(day: string, today: string, rangeDays: number): boolean {
  return day > shiftDay(today, -rangeDays) && day <= today;
}

/** 把週期鍵往前後推。daily 推天、weekly 推週、monthly 推月。 */
export function shiftPeriod(key: string, cadence: Cadence, delta: number): string {
  if (cadence === "daily") return shiftDay(key, delta);
  if (cadence === "weekly") return shiftDay(key, delta * 7);
  const [y, m] = key.split("-").map(Number) as [number, number];
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** 含當期在內的最近 n 個週期，由舊到新。 */
export function lastPeriods(today: string, cadence: Cadence, n: number): string[] {
  const now = periodKey(today, cadence);
  return Array.from({ length: n }, (_, i) => shiftPeriod(now, cadence, i - n + 1));
}

