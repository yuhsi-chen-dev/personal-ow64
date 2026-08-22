import assert from "node:assert/strict";
import { test } from "node:test";
import { layout, CORE_COORD, SIZE, SLOTS, actionCoord, subGoalCoordInCore } from "./mandala.ts";
import { actionProgress, rollup, type Log } from "./progress.ts";
import { localDay, shiftDay, lastDays } from "./day.ts";


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

const W = { rangeDays: 30, today: "2026-08-31" }; // 2026-08-31 是星期一
const log = (actionId: string, day: string, value = 1): Log => ({ actionId, day, occurredAt: new Date(1), value });

test("習慣型的分母是「期間內應達成次數」，不是天數", () => {
  const weekly = { id: "w", trackingType: "habit" as const, cadence: "weekly" as const };
  // 30 天 ÷ 7 = 5 週。做滿 5 週就是 100%，不該因為只做 5 次就顯示 17%。
  // 五個不同週的星期一，都落在區間內
  const logs = ["2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24", "2026-08-31"].map((d) => log("w", d));
  assert.equal(actionProgress(weekly, logs, W), 1);

  const daily = { id: "w", trackingType: "habit" as const, cadence: "daily" as const };
  assert.equal(Math.round(actionProgress(daily, logs, W)! * 100), 17, "同樣 5 筆，每日型就只有 5/30");
});

test("同一週期內重複打卡只算一次", () => {
  const weekly = { id: "w", trackingType: "habit" as const, cadence: "weekly" as const };
  const sameWeek = [log("w", "2026-08-24"), log("w", "2026-08-25"), log("w", "2026-08-26")];
  assert.equal(actionProgress(weekly, sameWeek, W), actionProgress(weekly, [log("w", "2026-08-24")], W));
});

test("習慣型只看統計區間內的紀錄，久了才不會全部變 100%", () => {
  const daily = { id: "d", trackingType: "habit" as const, cadence: "daily" as const };
  const old = Array.from({ length: 40 }, (_, i) => log("d", `2026-0${i < 20 ? "6" : "7"}-${String((i % 20) + 1).padStart(2, "0")}`));
  assert.equal(actionProgress(daily, old, W), 0, "全部在區間外，應該是 0 而不是滿分");
});

test("累計型不受區間影響，里程碑只有 0 或 1", () => {
  const quota = { id: "q", trackingType: "quota" as const, target: 10 };
  assert.equal(actionProgress(quota, [log("q", "2020-01-01", 5)], W), 0.5, "很久以前的累計仍然算數");
  assert.equal(actionProgress({ id: "q", trackingType: "quota", target: 0 }, [], W), 0, "沒設目標不能除以 0");

  const ms = { id: "m", trackingType: "milestone" as const };
  assert.equal(actionProgress(ms, [], W), 0);
  assert.equal(actionProgress(ms, [log("m", "2020-01-01")], W), 1);
});

test("信念型回傳 null，且必須被排除在平均之外而不是算成 0", () => {
  const mantra = { id: "x", trackingType: "mantra" as const };
  assert.equal(actionProgress(mantra, [log("x", "2026-08-30")], W), null);

  const done = { id: "m", trackingType: "milestone" as const };
  const logs = [log("m", "2026-08-30")];
  assert.equal(rollup([done, mantra], logs, W), 1, "一格信念不可以把 100% 拉成 50%");
  assert.equal(rollup([mantra], logs, W), null, "全部都是信念時沒有進度可言");
  assert.equal(rollup([], logs, W), null);
});

test("localDay 用當地日曆日，不是 UTC", () => {
  // 當地 8/23 早上 7 點。UTC+8 的話 toISOString() 會是 8/22，會把打卡記到前一天。
  const morning = new Date(2026, 7, 23, 7, 0, 0);
  assert.equal(localDay(morning), "2026-08-23");

  // 當地 8/23 深夜 23:30。UTC-5 的話 toISOString() 會是 8/24。
  assert.equal(localDay(new Date(2026, 7, 23, 23, 30, 0)), "2026-08-23");

  // 月、日都要補零
  assert.equal(localDay(new Date(2026, 0, 5, 12, 0, 0)), "2026-01-05");
});

test("shiftDay 跨月、跨年、閏日都要對", () => {
  assert.equal(shiftDay("2026-08-31", 1), "2026-09-01");
  assert.equal(shiftDay("2026-09-01", -1), "2026-08-31");
  assert.equal(shiftDay("2026-01-01", -1), "2025-12-31");
  assert.equal(shiftDay("2024-02-28", 1), "2024-02-29", "2024 是閏年");
  assert.equal(shiftDay("2025-02-28", 1), "2025-03-01", "2025 不是");
});

test("lastDays 含今天、由舊到新", () => {
  assert.deepEqual(lastDays("2026-03-02", 4), ["2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02"]);
});
