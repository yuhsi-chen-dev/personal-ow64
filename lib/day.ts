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
