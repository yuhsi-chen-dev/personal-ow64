// 把資料庫讀回來的稀疏資料，攤成 81 格的顯示模型。
// 純函式，不碰 React 也不碰資料庫，所以熱力圖的顏色與打卡狀態都測得到。
import { lastPeriods, periodKey, shiftPeriod, type Cadence } from "./day.ts";
import {
  CORE_BLOCK, CORE_COORD, SIZE, SLOTS,
  actionCoord, blockIndexOfSlot, subGoalCoordInBlock, subGoalCoordInCore,
} from "./mandala.ts";
import { actionProgress, rollup, type Action, type Log, type TrackingType, type Window } from "./progress.ts";

export type BoardAction = {
  id: string;
  subGoalId: string;
  position: number;
  title: string;
  trackingType: TrackingType;
  cadence: Cadence | null;
  target: number | null;
};
export type BoardSubGoal = { id: string; position: number; title: string };

export type Cell =
  | { kind: "core"; title: string; progress: number | null }
  | { kind: "subGoal"; slot: number; mirrored: boolean; id?: string; title: string; progress: number | null }
  | {
      kind: "action";
      slot: number;
      index: number;
      subGoalId?: string;
      id?: string;
      title: string;
      trackingType: TrackingType;
      cadence: Cadence | null;
      target: number | null;
      /** 信念型為 null，代表不計進度，不可以當成 0。 */
      progress: number | null;
      /** 本期（今天／本週／本月）是否已完成——決定格子上那顆圈的樣子。 */
      doneNow: boolean;
    };

export type Board = { cells: Cell[]; progress: number | null };

export type BoardInput = {
  planTitle: string;
  subGoals: BoardSubGoal[];
  actions: BoardAction[];
  logs: Log[];
  rangeDays: number;
  /** 使用者當地的今天，'YYYY-MM-DD'。只有瀏覽器算得準，見 lib/day.ts。 */
  today: string;
};

/** 本期是否已完成。habit 看當期、milestone 看有沒有做過、quota 永遠可以再加、mantra 沒有這回事。 */
export function isDoneNow(action: Pick<BoardAction, "id" | "trackingType" | "cadence">, logs: Log[], today: string) {
  const mine = logs.filter((l) => l.actionId === action.id);
  switch (action.trackingType) {
    case "habit": {
      const cadence = action.cadence ?? "daily";
      const now = periodKey(today, cadence);
      return mine.some((l) => periodKey(l.day, cadence) === now);
    }
    case "milestone":
      return mine.length > 0;
    case "quota":
    case "mantra":
      return false;
  }
}

export function buildBoard(input: BoardInput): Board {
  const { planTitle, subGoals, actions, logs, rangeDays, today } = input;
  const win: Window = { rangeDays, today };

  const subGoalAt = (slot: number) => subGoals.find((s) => s.position === slot);
  const actionsOf = (sg?: BoardSubGoal) => (sg ? actions.filter((a) => a.subGoalId === sg.id) : []);

  const cells = new Array<Cell>(SIZE * SIZE);
  const put = ([r, c]: readonly [number, number], cell: Cell) => (cells[r * SIZE + c] = cell);

  const total = rollup(actions as Action[], logs, win);
  put(CORE_COORD, { kind: "core", title: planTitle, progress: total });

  for (let slot = 0; slot < SLOTS; slot++) {
    const sg = subGoalAt(slot);
    const mine = actionsOf(sg);
    const sgProgress = rollup(mine as Action[], logs, win);

    for (const [coord, mirrored] of [
      [subGoalCoordInCore(slot), false],
      [subGoalCoordInBlock(slot), true],
    ] as const) {
      put(coord, { kind: "subGoal", slot, mirrored, id: sg?.id, title: sg?.title ?? "", progress: sgProgress });
    }

    for (let index = 0; index < SLOTS; index++) {
      const act = mine.find((a) => a.position === index);
      put(actionCoord(slot, index), {
        kind: "action",
        slot,
        index,
        subGoalId: sg?.id,
        id: act?.id,
        title: act?.title ?? "",
        trackingType: act?.trackingType ?? "habit",
        cadence: act?.cadence ?? (act ? null : "daily"),
        target: act?.target ?? null,
        progress: act ? actionProgress(act as Action, logs, win) : null,
        doneNow: act ? isDoneNow(act, logs, today) : false,
      });
    }
  }
  return { cells, progress: total };
}

/**
 * 進度轉成熱力圖的填色強度 0..1。
 * 沒填的格子回傳 null，呼叫端要畫成「空的」而不是「0%」——
 * 「還沒想到要做什麼」跟「想到了但都沒做」是兩件事，不能同色。
 */
export function heat(progress: number | null): number | null {
  if (progress === null) return null;
  // 下限 0.18：有內容但進度 0 的格子要明顯比「還沒填」的空格子濃（那個是 7%）。
  // 四捨五入到小數三位，這個值會直接進 CSS 的混色百分比。
  return Math.round((0.18 + 0.67 * Math.min(1, Math.max(0, progress))) * 1000) / 1000;
}

/** 面板上的「最近幾期」小格子：由舊到新。只有習慣型有意義。 */
export function recentPeriods(
  logs: Log[],
  action: Pick<BoardAction, "id" | "trackingType" | "cadence">,
  today: string,
  n = 7,
) {
  if (action.trackingType !== "habit") return [];
  const cadence = action.cadence ?? "daily";
  const hit = new Set(logs.filter((l) => l.actionId === action.id).map((l) => periodKey(l.day, cadence)));
  return lastPeriods(today, cadence, n).map((key) => ({ key, done: hit.has(key) }));
}

/**
 * 連續期數。當期還沒完成不算斷——從上一期起算，這樣白天看到的數字不會嚇人。
 * 真的空過一整期才歸零。只有習慣型有意義。
 */
export function streak(
  logs: Log[],
  action: Pick<BoardAction, "id" | "trackingType" | "cadence">,
  today: string,
): number {
  if (action.trackingType !== "habit") return 0;
  const cadence = action.cadence ?? "daily";
  const hit = new Set(logs.filter((l) => l.actionId === action.id).map((l) => periodKey(l.day, cadence)));
  const now = periodKey(today, cadence);
  let cursor = hit.has(now) ? now : shiftPeriod(now, cadence, -1);
  let n = 0;
  while (hit.has(cursor)) {
    n++;
    cursor = shiftPeriod(cursor, cadence, -1);
  }
  return n;
}

/**
 * 把 row-major 的 81 格重新排成 9 個區塊、每塊 9 格（塊內也是 row-major）。
 * 「點哪塊哪塊就長大」需要以區塊為單位排版，不能用平的 9×9 grid。
 */
export function toBlocks(cells: Cell[]): Cell[][] {
  const blocks: Cell[][] = Array.from({ length: 9 }, () => []);
  cells.forEach((cell, i) => {
    const r = Math.floor(i / SIZE);
    const c = i % SIZE;
    blocks[Math.floor(r / 3) * 3 + Math.floor(c / 3)]!.push(cell);
  });
  return blocks;
}

/** 這一格屬於哪個區塊。中央區塊裡的次目標本體算中央，鏡像與其行為算它自己的外圍區塊。 */
export function blockOfCell(cell: Cell): number {
  if (cell.kind === "core") return CORE_BLOCK;
  if (cell.kind === "subGoal") return cell.mirrored ? blockIndexOfSlot(cell.slot) : CORE_BLOCK;
  return blockIndexOfSlot(cell.slot);
}

