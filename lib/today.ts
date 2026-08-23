// 「今天該做什麼」的唯一判準。純函式，不碰 React 也不碰資料庫。
// 四種 trackingType 的語意見 docs/decisions/0008-tracking-taxonomy.md。
import { periodKey } from "./day.ts";
import type { Action, Log } from "./progress.ts";

/**
 * 一項行為今天的狀態。
 *
 * - `due`   今天要做，還沒做。
 * - `done`  今天做了。**今天之內**做的才算，昨天做的不算。
 * - `idle`  今天沒它的事：每週型本週稍早已經做過、里程碑早就完成、累計已達標。
 * - `mantra` 信念型。看得見，但不打卡也不計數。
 */
export type TodayState = "due" | "done" | "idle" | "mantra";

/**
 * 判準有一條不能違反：**「今天做完」要留在今天的清單裡，不能變成 idle。**
 *
 * 每週型星期一做完之後，星期三就該從清單上消失（idle）；但星期一當天做完，
 * 整個星期一都要維持 done。不這樣分，做完一件事會讓分母跟著少一，
 * 計數從 3/9 變成 3/8，看起來像什麼都沒發生。
 */
export function todayState(action: Action, logs: Log[], today: string): TodayState {
  if (action.trackingType === "mantra") return "mantra";

  const mine = logs.filter((l) => l.actionId === action.id);
  const doneToday = mine.some((l) => l.day === today);

  switch (action.trackingType) {
    case "habit": {
      const cadence = action.cadence ?? "daily";
      const now = periodKey(today, cadence);
      const thisPeriod = mine.filter((l) => periodKey(l.day, cadence) === now);
      if (thisPeriod.length === 0) return "due";
      return doneToday ? "done" : "idle";
    }
    case "milestone":
      if (mine.length === 0) return "due";
      return doneToday ? "done" : "idle";
    case "quota": {
      // 累計型永遠可以再加，除非已經到達目標。沒設目標就當作永遠沒到。
      const target = action.target ?? 0;
      const reached = target > 0 && mine.reduce((s, l) => s + l.value, 0) >= target;
      if (reached) return doneToday ? "done" : "idle";
      return doneToday ? "done" : "due";
    }
  }
}

/** 今天的計數：分母是今天清單上的項目（due + done），信念型與 idle 都不算。 */
export function tally(states: TodayState[]): { done: number; total: number } {
  const inSet = states.filter((s) => s === "due" || s === "done");
  return { done: inSet.filter((s) => s === "done").length, total: inSet.length };
}
