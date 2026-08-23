import assert from "node:assert/strict";
import { test } from "node:test";
import { endOfMonth } from "./day.ts";
import { dailyCounts, heatmapWeeks, monthlyTrend, trendPath } from "./trend.ts";
import type { Action, Log } from "./progress.ts";

const log = (actionId: string, day: string, value = 1): Log => ({
  actionId, day, occurredAt: new Date(`${day}T12:00:00Z`), value,
});

test("endOfMonth 認得大小月與閏日", () => {
  assert.equal(endOfMonth("2026-02"), "2026-02-28");
  assert.equal(endOfMonth("2028-02"), "2028-02-29");
  assert.equal(endOfMonth("2026-04"), "2026-04-30");
  assert.equal(endOfMonth("2026-12"), "2026-12-31");
});

test("dailyCounts 把同一天的多筆加起來", () => {
  const m = dailyCounts([log("a", "2026-08-20"), log("b", "2026-08-20"), log("a", "2026-08-21")]);
  assert.equal(m.get("2026-08-20"), 2);
  assert.equal(m.get("2026-08-21"), 1);
  assert.equal(m.get("2026-08-22"), undefined);
});

test("熱圖是 53×7 的完整方陣，最後一欄含今天，之後的日子標成 future", () => {
  const weeks = heatmapWeeks([log("a", "2026-08-20")], "2026-08-22");
  assert.equal(weeks.length, 53);
  assert.ok(weeks.every((w) => w.length === 7));

  const last = weeks.at(-1)!;
  assert.ok(last.some((c) => c.day === "2026-08-22"));
  // 2026-08-22 是週六，所以同一欄的週日還在未來。
  assert.deepEqual(
    last.filter((c) => c.future).map((c) => c.day),
    ["2026-08-23"],
  );
  assert.equal(weeks.flat().find((c) => c.day === "2026-08-20")?.count, 1);
});

test("熱圖每一欄都從週一開始", () => {
  for (const w of heatmapWeeks([], "2026-08-22")) {
    assert.equal(w[0]!.day, new Date(w[0]!.day + "T00:00:00").getDay() === 1 ? w[0]!.day : "不是週一");
  }
});

test("里程碑今天才完成，不能讓 12 個月全部變成 100%", () => {
  const actions: Action[] = [{ id: "a", trackingType: "milestone" }];
  const points = monthlyTrend(actions, [log("a", "2026-08-22")], "2026-08-22", 12);
  assert.equal(points.length, 12);
  assert.equal(points.at(-1)!.value, 1);
  assert.ok(points.slice(0, -1).every((p) => p.value === 0), "過去的月份應該還是 0");
});

test("累計型的趨勢只算到那個月底為止", () => {
  const actions: Action[] = [{ id: "a", trackingType: "quota", target: 10 }];
  const logs = [log("a", "2026-06-15", 5), log("a", "2026-08-10", 5)];
  const points = monthlyTrend(actions, logs, "2026-08-22", 4); // 2026-05..08
  assert.deepEqual(points.map((p) => p.month), ["2026-05", "2026-06", "2026-07", "2026-08"]);
  assert.deepEqual(points.map((p) => p.value), [0, 0.5, 0.5, 1]);
});

test("全是信念型時趨勢是 null，不是 0", () => {
  const points = monthlyTrend([{ id: "a", trackingType: "mantra" }], [], "2026-08-22", 3);
  assert.ok(points.every((p) => p.value === null));
});

test("trendPath 少於兩個可用點就畫不出線", () => {
  assert.equal(trendPath([{ month: "2026-08", value: 1 }], 100, 20), "");
  assert.equal(trendPath([{ month: "2026-07", value: null }, { month: "2026-08", value: 1 }], 100, 20), "");
  assert.equal(
    trendPath([{ month: "2026-07", value: 0 }, { month: "2026-08", value: 1 }], 100, 20),
    "M0.0 20.0 L100.0 0.0",
  );
});
