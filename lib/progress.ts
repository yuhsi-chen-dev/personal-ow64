// 進度彙總的唯一來源。圖表元件一律呼叫這裡，不要自己寫百分比公式。
// 四種 trackingType 的語意見 docs/decisions/0008-tracking-taxonomy.md。
import { expectedPeriods, inWindow, periodKey, type Cadence } from "./day.ts";

export type { Cadence };
export type TrackingType = "habit" | "quota" | "milestone" | "mantra";

export type Action = {
  id: string;
  trackingType: TrackingType;
  /** 只有 habit 用得到；決定分母與同期冪等。 */
  cadence?: Cadence | null;
  /** 只有 habit 用得到：一期要做幾次。null／undefined 等同 1。 */
  timesPerPeriod?: number | null;
  /** 只有 quota 用得到。 */
  target?: number | null;
};

export type Log = {
  actionId: string;
  /** 'YYYY-MM-DD'，使用者當地的日曆日。 */
  day: string;
  /** 寫入的時間點。 */
  occurredAt: Date;
  value: number;
};

/** 統計區間。habit 是「速率」需要區間；quota 與 milestone 是累計，不受區間影響。 */
export type Window = { rangeDays: number; today: string };

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/** 習慣型一期要做幾次。舊資料與未設定都是 1。 */
export const perPeriod = (action: Pick<Action, "timesPerPeriod">) => Math.max(1, action.timesPerPeriod ?? 1);

/** 區間內每個週期各有幾筆紀錄。 */
function countByPeriod(logs: Log[], cadence: Cadence, window: Window): Map<string, number> {
  const counts = new Map<string, number>();
  for (const l of logs) {
    if (!inWindow(l.day, window.today, window.rangeDays)) continue;
    const k = periodKey(l.day, cadence);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

/** 某一項行為在 day 所屬的那一期已經記了幾筆。冪等、今天頁與格子上的「1/3」都靠它。 */
export function periodCount(action: Action, logs: Log[], day: string): number {
  const cadence = action.cadence ?? "daily";
  return logs.filter((l) => l.actionId === action.id && periodKey(l.day, cadence) === periodKey(day, cadence)).length;
}

/**
 * 單項行為的進度，0..1。
 *
 * 回傳 null 代表「這一項不計進度」（信念型）。呼叫端必須把它排除在平均之外，
 * **不可以當成 0**——否則一格信念會讓整個次目標永遠上不了 100%。
 */
export function actionProgress(action: Action, logs: Log[], window: Window): number | null {
  if (action.trackingType === "mantra") return null;

  const mine = logs.filter((l) => l.actionId === action.id);

  switch (action.trackingType) {
    case "habit": {
      const cadence = action.cadence ?? "daily";
      const per = perPeriod(action);
      // 分子是「每期實際達成次數，超過需求的不算」——某週跑 5 次不能補上一週的空白，
      // 否則又回到 0003 那種安靜的算錯，只是方向相反。
      // 只看區間內的紀錄，不篩的話跑久了每個習慣都會是 100%。
      let hit = 0;
      for (const n of countByPeriod(mine, cadence, window).values()) hit += Math.min(n, per);
      return clamp01(hit / (expectedPeriods(window.rangeDays, cadence) * per));
    }
    case "quota": {
      // 累計型是朝目標前進，不是速率，所以不篩區間。
      const target = action.target ?? 0;
      if (target <= 0) return 0;
      return clamp01(mine.reduce((s, l) => s + l.value, 0) / target);
    }
    case "milestone":
      return mine.length > 0 ? 1 : 0;
  }
}

/**
 * 往上彙總。信念型（progress 為 null）會被略過而不是算成 0。
 * 一項都沒有、或全部都是信念型時回傳 null，呼叫端自行決定怎麼顯示。
 */
export function rollup(actions: Action[], logs: Log[], window: Window): number | null {
  const scores = actions.map((a) => actionProgress(a, logs, window)).filter((p): p is number => p !== null);
  if (scores.length === 0) return null;
  return scores.reduce((s, p) => s + p, 0) / scores.length;
}
