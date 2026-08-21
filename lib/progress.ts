// 進度彙總的唯一來源。圖表元件一律呼叫這裡，不要自己寫百分比公式。
// 三種 trackingType 的語意見 docs/decisions/0003-hybrid-tracking.md。

export type TrackingType = "daily" | "count" | "percent";

export type Action = {
  id: string;
  trackingType: TrackingType;
  /** count 型的目標次數；其他型態忽略。 */
  target?: number | null;
};

export type Log = {
  actionId: string;
  /** 'YYYY-MM-DD'，使用者當地的日曆日；daily 的同日冪等鍵。 */
  day: string;
  /** 寫入的時間點，percent 取最新一筆時用。 */
  occurredAt: Date;
  value: number;
};

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * 單項行為的進度，正規化為 0..1。
 * rangeDays 是使用者選定的統計區間天數，daily 的分母；不可改用「有紀錄的天數」，
 * 否則久沒做的行為會顯示成 100%。
 */
export function actionProgress(action: Action, logs: Log[], rangeDays: number): number {
  const mine = logs.filter((l) => l.actionId === action.id);
  if (mine.length === 0) return 0;

  switch (action.trackingType) {
    case "daily": {
      if (rangeDays <= 0) return 0;
      const days = new Set(mine.map((l) => l.day));
      return clamp01(days.size / rangeDays);
    }
    case "count": {
      const target = action.target ?? 0;
      if (target <= 0) return 0;
      return clamp01(mine.reduce((s, l) => s + l.value, 0) / target);
    }
    case "percent": {
      const latest = mine.reduce((a, b) => (b.occurredAt >= a.occurredAt ? b : a));
      return clamp01(latest.value / 100);
    }
  }
}

/** 空的（尚未填寫的）次目標回傳 null，呼叫端自行決定怎麼顯示，不要當成 0。 */
export function rollup(actions: Action[], logs: Log[], rangeDays: number): number | null {
  if (actions.length === 0) return null;
  const sum = actions.reduce((s, a) => s + actionProgress(a, logs, rangeDays), 0);
  return sum / actions.length;
}
