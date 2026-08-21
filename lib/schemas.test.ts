import assert from "node:assert/strict";
import { test } from "node:test";
import { actionInput, logInput, day, planInput } from "./schemas.ts";

const ok = (r: { success: boolean }) => r.success;

test("title 去頭尾空白，空白與超長都擋", () => {
  assert.equal(planInput.parse({ title: "  健康  " }).title, "健康");
  assert.ok(!ok(planInput.safeParse({ title: "   " })));
  assert.ok(!ok(planInput.safeParse({ title: "x".repeat(201) })));
});

test("target 的必填與否跟著 trackingType 走", () => {
  const base = { subGoalId: "sg1", position: 0, title: "跑步" };
  assert.ok(ok(actionInput.safeParse({ ...base, trackingType: "count", target: 10 })));
  assert.ok(!ok(actionInput.safeParse({ ...base, trackingType: "count" })), "count 少了 target 要擋");
  assert.ok(!ok(actionInput.safeParse({ ...base, trackingType: "count", target: 0 })), "target 要正整數");
  assert.ok(!ok(actionInput.safeParse({ ...base, trackingType: "daily", target: 10 })), "daily 不該有 target");
  assert.equal(actionInput.parse({ ...base, trackingType: "daily" }).target, null, "daily 補成 null");
});

test("position 只收 0..7 的整數", () => {
  const base = { subGoalId: "sg1", title: "跑步", trackingType: "daily" as const };
  assert.ok(!ok(actionInput.safeParse({ ...base, position: 8 })));
  assert.ok(!ok(actionInput.safeParse({ ...base, position: -1 })));
  assert.ok(!ok(actionInput.safeParse({ ...base, position: 1.5 })));
});

test("day 要是真實存在的日期", () => {
  assert.ok(ok(day.safeParse("2026-02-28")));
  assert.ok(!ok(day.safeParse("2026-02-30")), "2 月沒有 30 號");
  assert.ok(!ok(day.safeParse("2025-02-29")), "2025 不是閏年");
  assert.ok(ok(day.safeParse("2024-02-29")), "2024 是閏年");
  assert.ok(!ok(day.safeParse("2026-8-1")), "月日要補零");
});

test("value 的合法範圍跟著 trackingType 走", () => {
  const base = { actionId: "a1", day: "2026-08-21" };
  assert.ok(ok(logInput.safeParse({ ...base, trackingType: "daily", value: 1 })));
  assert.ok(!ok(logInput.safeParse({ ...base, trackingType: "daily", value: 2 })));
  assert.ok(ok(logInput.safeParse({ ...base, trackingType: "count", value: 3 })));
  assert.ok(!ok(logInput.safeParse({ ...base, trackingType: "count", value: 0 })));
  assert.ok(ok(logInput.safeParse({ ...base, trackingType: "percent", value: 0 })));
  assert.ok(ok(logInput.safeParse({ ...base, trackingType: "percent", value: 100 })));
  assert.ok(!ok(logInput.safeParse({ ...base, trackingType: "percent", value: 101 })));
  assert.ok(!ok(logInput.safeParse({ ...base, trackingType: "count", value: Infinity })));
});
