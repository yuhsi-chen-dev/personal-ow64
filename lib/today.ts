// 「今天該做什麼」的唯一判準。純函式，不碰 React 也不碰資料庫。
// 四種 trackingType 的語意見 docs/decisions/0008-tracking-taxonomy.md。
import { perPeriod, periodCount, type Action, type Log } from "./progress.ts";

/**
 * 一項行為今天的狀態。
 *
 * - `due`   今天要做，還沒做完。一期要做 3 次的，做了 1 次仍然是 due。
 * - `done`  今天做了。**今天之內**做的才算，昨天做的不算。
 * - `open`  可以推進，但今天沒有應做量：還沒完成的里程碑、還沒達標的累計。
 * - `idle`  今天沒它的事：每週型本週稍早已經做過、里程碑早就完成、累計已達標。
 * - `mantra` 信念型。看得見，但不打卡也不計數。
 */
export type TodayState = "due" | "done" | "open" | "idle" | "mantra";

/**
 * 判準有兩條不能違反。
 *
 * 一、**「今天做完」要留在今天的清單裡，不能變成 idle。**
 * 每週型星期一做完之後，星期三就該從清單上消失（idle）；但星期一當天做完，
 * 整個星期一都要維持 done。不這樣分，做完一件事會讓分母跟著少一，
 * 計數從 3/9 變成 3/8，看起來像什麼都沒發生。
 *
 * 二、**只有「有週期」的事才是 due，也就是只有習慣型。**
 * 里程碑與累計沒有 cadence，就沒有「本期應做量」，自然也沒有今天的應做量——
 * 它們是 `open`：看得到、按得下去，但不算在今天的分數裡。
 * 混進去的話，一個一年期的目標會讓今天的分母永遠差一，那條進度條再也不會滿。
 * 完整理由見 docs/decisions/0016-today-scope.md。
 */
export function todayState(action: Action, logs: Log[], today: string): TodayState {
  if (action.trackingType === "mantra") return "mantra";

  const mine = logs.filter((l) => l.actionId === action.id);
  const doneToday = mine.some((l) => l.day === today);

  switch (action.trackingType) {
    case "habit": {
      // 本期還沒做滿就還是 due——「每週 3 次」做完第一次就從清單上消失，
      // 剩下兩次不會有人提醒你。
      if (periodCount(action, logs, today) < perPeriod(action)) return "due";
      return doneToday ? "done" : "idle";
    }
    case "milestone":
      // 今天真的完成了就進今天的分數——它是因為你做了才出現的，不是一直欠著。
      if (doneToday) return "done";
      return mine.length === 0 ? "open" : "idle";
    case "quota": {
      // 累計型永遠可以再加，除非已經到達目標。沒設目標就當作永遠沒到。
      if (doneToday) return "done";
      const target = action.target ?? 0;
      const reached = target > 0 && mine.reduce((s, l) => s + l.value, 0) >= target;
      return reached ? "idle" : "open";
    }
  }
}

/**
 * 今天的計數：分母是今天清單上的項目（due + done）。
 * `open`、`idle`、`mantra` 都不算——沒有今天應做量的事不該佔分母。
 */
export function tally(states: TodayState[]): { done: number; total: number } {
  const inSet = states.filter((s) => s === "due" || s === "done");
  return { done: inSet.filter((s) => s === "done").length, total: inSet.length };
}
