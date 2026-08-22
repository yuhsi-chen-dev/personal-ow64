import assert from "node:assert/strict";
import { test } from "node:test";
import {
  blockOfCell, buildBoard, heat, recentPeriods, streak, toBlocks,
  type BoardAction, type BoardSubGoal,
} from "./board.ts";
import { CORE_COORD, SIZE } from "./mandala.ts";
import type { Log } from "./progress.ts";
import { coreFill, slotFill, slotHue } from "./palette.ts";

const at = (cells: unknown[], r: number, c: number) => cells[r * SIZE + c];
const sg = (position: number, id: string, title: string): BoardSubGoal => ({ id, position, title });
const act = (o: Partial<BoardAction> & { id: string; subGoalId: string; position: number }): BoardAction => ({
  title: "行為", trackingType: "habit", cadence: "daily", target: null, ...o,
});

const base = { planTitle: "核心", subGoals: [], actions: [], logs: [], rangeDays: 30, today: "2026-08-22" };

test("空的計劃表也要攤出完整 81 格，進度是 null 不是 0", () => {
  const b = buildBoard(base);
  assert.equal(b.cells.length, 81);
  assert.equal(b.cells.filter((c) => c === undefined).length, 0);
  assert.equal(b.progress, null);
  assert.deepEqual(at(b.cells, CORE_COORD[0], CORE_COORD[1]), { kind: "core", title: "核心", progress: null });
});

test("次目標的兩個座標拿到同一份資料與同一個進度", () => {
  const b = buildBoard({
    ...base,
    subGoals: [sg(0, "s0", "閱讀")],
    actions: [act({ id: "a", subGoalId: "s0", position: 0 })],
    logs: [{ actionId: "a", day: "2026-08-22", occurredAt: new Date(1), value: 1 }],
  });
  const pair = b.cells.filter((c) => c.kind === "subGoal" && c.slot === 0);
  assert.equal(pair.length, 2);
  assert.equal(pair.filter((c) => c.kind === "subGoal" && c.mirrored).length, 1);
  const [x, y] = pair as Extract<(typeof pair)[number], { kind: "subGoal" }>[];
  assert.equal(x!.title, "閱讀");
  assert.equal(x!.progress, y!.progress, "本體與鏡像的進度必須一致");
});

test("doneNow 只看當期，昨天打的不算", () => {
  const logs: Log[] = [
    { actionId: "a", day: "2026-08-21", occurredAt: new Date(1), value: 1 },
    { actionId: "b", day: "2026-08-22", occurredAt: new Date(2), value: 1 },
  ];
  const b = buildBoard({
    ...base,
    subGoals: [sg(0, "s0", "x")],
    actions: [act({ id: "a", subGoalId: "s0", position: 0 }), act({ id: "b", subGoalId: "s0", position: 1 })],
    logs,
  });
  const actions = b.cells.filter((c) => c.kind === "action" && c.slot === 0);
  const byIndex = (i: number) => actions.find((c) => c.kind === "action" && c.index === i)!;
  const done = (c: (typeof actions)[number]) => (c.kind === "action" ? c.doneNow : null);
  assert.equal(done(byIndex(0)), false, "昨天打的不算今天");
  assert.equal(done(byIndex(1)), true);
});

test("次目標沒填時，底下 8 格沒有 subGoalId（不能編輯）", () => {
  const b = buildBoard(base);
  const cells = b.cells.filter((c) => c.kind === "action" && c.slot === 5);
  assert.equal(cells.length, 8);
  assert.ok(cells.every((c) => c.kind === "action" && c.subGoalId === undefined));
});

test("heat：沒填是 null，有內容但 0% 仍看得見，滿分是 0.8", () => {
  assert.equal(heat(null), null, "沒填的格子不能跟 0% 同色");
  assert.equal(heat(0), 0.18, "有填但 0% 的濃度要明顯高於空格子的 7%");
  assert.equal(heat(1), 0.85);
  assert.ok(heat(0.5)! > heat(0.1)!);
  assert.equal(heat(5), 0.85, "超過 1 要夾住");
});

test("recentPeriods 由舊到新，只看有沒有紀錄", () => {
  const logs: Log[] = [
    { actionId: "a", day: "2026-08-20", occurredAt: new Date(1), value: 1 },
    { actionId: "a", day: "2026-08-22", occurredAt: new Date(2), value: 1 },
    { actionId: "b", day: "2026-08-21", occurredAt: new Date(3), value: 1 }, // 別人的，不算
  ];
  const r = recentPeriods(logs, { id: "a", trackingType: "habit", cadence: "daily" }, "2026-08-22", 4);
  assert.deepEqual(r.map((x) => x.key), ["2026-08-19", "2026-08-20", "2026-08-21", "2026-08-22"]);
  assert.deepEqual(r.map((x) => x.done), [false, true, false, true]);
});

test("8 個次目標的色相互不重複，越界也拿得到顏色", () => {
  const hues = Array.from({ length: 8 }, (_, i) => slotHue(i));
  assert.equal(new Set(hues).size, 8, "8 個色相不能重複");
  assert.equal(slotHue(8), slotHue(0), "越界要繞回來，不能是 undefined");
  assert.equal(slotHue(-1), slotHue(7));
  assert.ok(hues.every((h) => h >= 0 && h < 360));
});

test("沒填的格子不套色相，有填的依進度混色", () => {
  assert.match(slotFill(0, null), /7%/, "空格子只帶極淡色相");
  assert.match(slotFill(0, 0.5), /color-mix.*50%/);
  assert.notEqual(slotFill(0, null), slotFill(0, heat(0)), "空格子不能跟 0% 同色");
  assert.equal(coreFill(null), "var(--surface-2)");
});

test("streak：今天沒打卡不算斷，空過一整天才歸零", () => {
  const mk = (days: string[]): Log[] =>
    days.map((day, i) => ({ actionId: "a", day, occurredAt: new Date(i), value: 1 }));

  const daily = { id: "a", trackingType: "habit" as const, cadence: "daily" as const };
  assert.equal(streak(mk(["2026-08-20", "2026-08-21", "2026-08-22"]), daily, "2026-08-22"), 3);
  assert.equal(streak(mk(["2026-08-20", "2026-08-21"]), daily, "2026-08-22"), 2, "今天還沒打，但昨天有，要保留");
  assert.equal(streak(mk(["2026-08-19", "2026-08-20"]), daily, "2026-08-22"), 0, "空過一整期就歸零");
  assert.equal(streak(mk(["2026-08-18", "2026-08-20", "2026-08-21"]), daily, "2026-08-21"), 2, "中間的洞會斷");
  assert.equal(streak([], daily, "2026-08-22"), 0);

  const weekly = { id: "a", trackingType: "habit" as const, cadence: "weekly" as const };
  assert.equal(streak(mk(["2026-08-11", "2026-08-19"]), weekly, "2026-08-22"), 2, "每週型算的是連續幾週");
  assert.equal(streak(mk(["2026-08-22"]), { id: "a", trackingType: "milestone", cadence: null }, "2026-08-22"), 0, "只有習慣型有連續");
});

test("toBlocks 切成 9 塊各 9 格，塊內順序與原圖一致", () => {
  const b = buildBoard({ ...base, subGoals: [sg(0, "s0", "閱讀")] });
  const blocks = toBlocks(b.cells);
  assert.equal(blocks.length, 9);
  assert.ok(blocks.every((x) => x.length === 9));

  // 中央區塊（編號 4）的中心格必須是核心目標
  assert.equal(blocks[4]![4]!.kind, "core");
  // 次目標 0 的鏡像在它自己的外圍區塊中心
  const own = blocks[blockOfCell({ kind: "subGoal", slot: 0, mirrored: true, title: "", progress: null })]!;
  assert.equal(own[4]!.kind, "subGoal");
});

test("blockOfCell：本體算中央，鏡像與底下的行為算外圍", () => {
  assert.equal(blockOfCell({ kind: "core", title: "", progress: null }), 4);
  assert.equal(blockOfCell({ kind: "subGoal", slot: 3, mirrored: false, title: "", progress: null }), 4);

  const own = blockOfCell({ kind: "subGoal", slot: 3, mirrored: true, title: "", progress: null });
  assert.notEqual(own, 4, "鏡像不在中央區塊");
  assert.equal(
    blockOfCell({
      kind: "action", slot: 3, index: 5, title: "", trackingType: "habit",
      cadence: "daily", target: null, progress: null, doneNow: false,
    }),
    own,
    "行為要跟它的次目標鏡像在同一塊",
  );

  const all = new Set([0, 1, 2, 3, 4, 5, 6, 7].map((s) =>
    blockOfCell({ kind: "subGoal", slot: s, mirrored: true, title: "", progress: null })));
  assert.equal(all.size, 8, "8 個次目標各佔一個外圍區塊");
  assert.ok(!all.has(4), "沒有人佔用中央區塊");
});
