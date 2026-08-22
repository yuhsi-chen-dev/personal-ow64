import assert from "node:assert/strict";
import { test } from "node:test";
import { actionInput, logInput, day, planInput } from "./schemas.ts";

const ok = (r: { success: boolean }) => r.success;

test("title 去頭尾空白，空白與超長都擋", () => {
  assert.equal(planInput.parse({ title: "  健康  " }).title, "健康");
  assert.ok(!ok(planInput.safeParse({ title: "   " })));
  assert.ok(!ok(planInput.safeParse({ title: "x".repeat(201) })));
});

test("cadence 與 target 各自綁在對的 trackingType 上", () => {
  const base = { subGoalId: "sg1", position: 0, title: "跑步" };
  assert.ok(ok(actionInput.safeParse({ ...base, trackingType: "habit", cadence: "weekly" })));
  assert.ok(!ok(actionInput.safeParse({ ...base, trackingType: "habit" })), "習慣一定要有頻率");
  assert.ok(!ok(actionInput.safeParse({ ...base, trackingType: "habit", cadence: "yearly" })), "沒有每年這個選項");
  assert.ok(!ok(actionInput.safeParse({ ...base, trackingType: "habit", cadence: "daily", target: 10 })), "習慣不該有目標數量");

  assert.ok(ok(actionInput.safeParse({ ...base, trackingType: "quota", target: 10 })));
  assert.ok(!ok(actionInput.safeParse({ ...base, trackingType: "quota" })), "累計少了目標要擋");
  assert.ok(!ok(actionInput.safeParse({ ...base, trackingType: "quota", target: 0 })), "目標要大於 0");
  assert.ok(!ok(actionInput.safeParse({ ...base, trackingType: "quota", target: 10, cadence: "daily" })), "累計不該有頻率");

  for (const t of ["milestone", "mantra"] as const) {
    const r = actionInput.parse({ ...base, trackingType: t });
    assert.equal(r.cadence, null, `${t} 的 cadence 要補成 null`);
    assert.equal(r.target, null, `${t} 的 target 要補成 null`);
  }
});

test("累計少填目標時給看得懂的中文訊息，不要漏出 Zod 原文", () => {
  const r = actionInput.safeParse({ subGoalId: "sg1", position: 0, title: "讀書", trackingType: "quota" });
  assert.ok(!r.success);
  const msg = r.error!.issues.map((i) => i.message).join("；");
  assert.match(msg, /目標數量/);
  assert.doesNotMatch(msg, /Invalid input|expected/i);
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

test("value 的合法範圍跟著 trackingType 走，信念型根本不能打卡", () => {
  const base = { actionId: "a1", day: "2026-08-21" };
  assert.ok(ok(logInput.safeParse({ ...base, trackingType: "habit", value: 1 })));
  assert.ok(!ok(logInput.safeParse({ ...base, trackingType: "habit", value: 2 })), "習慣一次就是一次");
  assert.ok(ok(logInput.safeParse({ ...base, trackingType: "milestone", value: 1 })));
  assert.ok(!ok(logInput.safeParse({ ...base, trackingType: "milestone", value: 0.5 })), "里程碑沒有半完成");
  assert.ok(ok(logInput.safeParse({ ...base, trackingType: "quota", value: 3 })));
  assert.ok(!ok(logInput.safeParse({ ...base, trackingType: "quota", value: 0 })));
  assert.ok(!ok(logInput.safeParse({ ...base, trackingType: "quota", value: Infinity })));

  const mantra = logInput.safeParse({ ...base, trackingType: "mantra", value: 1 });
  assert.ok(!mantra.success, "信念型不該有紀錄");
  assert.match(mantra.error!.issues.map((i) => i.message).join(""), /信念/);
});
