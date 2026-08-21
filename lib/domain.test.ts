import assert from "node:assert/strict";
import { test } from "node:test";
import { layout, CORE_COORD, SIZE, SLOTS, actionCoord, subGoalCoordInCore } from "./mandala.ts";
import { actionProgress, rollup, type Log } from "./progress.ts";

const d = (ms: number) => new Date(ms);

test("9x9 每格恰好被指派一次，且組成為 1 核心 / 8 次目標(各兩處) / 64 行為", () => {
  const cells = layout();
  assert.equal(cells.length, SIZE * SIZE);
  assert.equal(cells.filter((c) => c === undefined).length, 0, "有格子沒被填到");

  assert.deepEqual(cells[CORE_COORD[0] * SIZE + CORE_COORD[1]], { kind: "core" });
  assert.equal(cells.filter((c) => c.kind === "core").length, 1);
  assert.equal(cells.filter((c) => c.kind === "subGoal").length, SLOTS * 2);
  assert.equal(cells.filter((c) => c.kind === "action").length, 64);

  // 每個次目標剛好一個本體 + 一個鏡像
  for (let i = 0; i < SLOTS; i++) {
    const mine = cells.filter((c) => c.kind === "subGoal" && c.subGoal === i);
    assert.equal(mine.length, 2);
    assert.equal(mine.filter((c) => c.kind === "subGoal" && c.mirrored).length, 1);
  }
});

test("slot 越界要丟錯，不能回傳壞座標", () => {
  assert.throws(() => actionCoord(0, 8), RangeError);
  assert.throws(() => subGoalCoordInCore(-1), RangeError);
});

test("daily 的分母是統計區間，不是有紀錄的天數", () => {
  const logs: Log[] = [
    { actionId: "a", day: "2026-08-01", occurredAt: d(1), value: 1 },
    { actionId: "a", day: "2026-08-01", occurredAt: d(2), value: 1 }, // 同日重複不加倍
    { actionId: "a", day: "2026-08-02", occurredAt: d(3), value: 1 },
  ];
  const a = { id: "a", trackingType: "daily" as const };
  assert.equal(actionProgress(a, logs, 4), 0.5);
  assert.equal(actionProgress(a, logs, 1), 1, "超過區間要夾在 1");
});

test("count 累加除以目標；percent 取最新一筆", () => {
  const logs: Log[] = [
    { actionId: "c", day: "2026-08-01", occurredAt: d(1), value: 3 },
    { actionId: "c", day: "2026-08-05", occurredAt: d(2), value: 2 },
    { actionId: "p", day: "2026-08-01", occurredAt: d(9), value: 80 },
    { actionId: "p", day: "2026-08-02", occurredAt: d(5), value: 40 }, // 較舊，不該勝出
  ];
  assert.equal(actionProgress({ id: "c", trackingType: "count", target: 10 }, logs, 30), 0.5);
  assert.equal(actionProgress({ id: "p", trackingType: "percent" }, logs, 30), 0.8);
  assert.equal(actionProgress({ id: "c", trackingType: "count", target: 0 }, logs, 30), 0, "沒設目標不能除以 0");
});

test("rollup 跨型態先正規化再平均；空的次目標是 null 不是 0", () => {
  const logs: Log[] = [
    { actionId: "c", day: "2026-08-01", occurredAt: d(1), value: 5 },
    { actionId: "p", day: "2026-08-01", occurredAt: d(1), value: 100 },
  ];
  const r = rollup(
    [{ id: "c", trackingType: "count", target: 10 }, { id: "p", trackingType: "percent" }],
    logs, 30,
  );
  assert.equal(r, 0.75);
  assert.equal(rollup([], logs, 30), null);
});
