import assert from "node:assert/strict";
import { test } from "node:test";
import { tally, todayState } from "./today.ts";
import type { Action, Log } from "./progress.ts";

const TODAY = "2026-08-19"; // 星期三
const log = (day: string, value = 1): Log => ({
  actionId: "a", day, occurredAt: new Date(`${day}T12:00:00Z`), value,
});
const habit = (cadence: Action["cadence"]): Action => ({ id: "a", trackingType: "habit", cadence });

test("信念型永遠是 mantra，不管有沒有紀錄", () => {
  assert.equal(todayState({ id: "a", trackingType: "mantra" }, [], TODAY), "mantra");
  assert.equal(todayState({ id: "a", trackingType: "mantra" }, [log(TODAY)], TODAY), "mantra");
});

test("每日習慣：沒打卡是 due，今天打過是 done，昨天打的不算", () => {
  assert.equal(todayState(habit("daily"), [], TODAY), "due");
  assert.equal(todayState(habit("daily"), [log(TODAY)], TODAY), "done");
  assert.equal(todayState(habit("daily"), [log("2026-08-18")], TODAY), "due");
});

test("每週習慣：本週稍早做過就 idle，今天做的維持 done", () => {
  // 2026-08-17 是同一週的星期一
  assert.equal(todayState(habit("weekly"), [log("2026-08-17")], TODAY), "idle");
  assert.equal(todayState(habit("weekly"), [log(TODAY)], TODAY), "done");
  // 上一週做的不算，這週還是要做
  assert.equal(todayState(habit("weekly"), [log("2026-08-14")], TODAY), "due");
});

test("每月習慣：本月稍早做過就 idle，跨月就重新 due", () => {
  assert.equal(todayState(habit("monthly"), [log("2026-08-03")], TODAY), "idle");
  assert.equal(todayState(habit("monthly"), [log("2026-07-31")], TODAY), "due");
});

test("里程碑：沒做過是 due，今天完成是 done，以前完成的就不再出現", () => {
  const m: Action = { id: "a", trackingType: "milestone" };
  assert.equal(todayState(m, [], TODAY), "due");
  assert.equal(todayState(m, [log(TODAY)], TODAY), "done");
  assert.equal(todayState(m, [log("2026-01-01")], TODAY), "idle");
});

test("累計型：沒到目標就一直可以做，到了目標才退場", () => {
  const q = (target: number | null): Action => ({ id: "a", trackingType: "quota", target });
  assert.equal(todayState(q(10), [], TODAY), "due");
  assert.equal(todayState(q(10), [log(TODAY, 3)], TODAY), "done", "今天加過就是 done，但還沒到目標");
  assert.equal(todayState(q(10), [log("2026-08-01", 4)], TODAY), "due", "以前加過但沒到目標，今天還是要做");
  assert.equal(todayState(q(10), [log("2026-08-01", 10)], TODAY), "idle", "早就達標，今天沒它的事");
  assert.equal(todayState(q(10), [log("2026-08-01", 7), log(TODAY, 3)], TODAY), "done", "今天達標，今天之內維持 done");
  assert.equal(todayState(q(null), [log(TODAY, 99)], TODAY), "done", "沒設目標就永遠到不了，不會變 idle");
});

test("只算自己的紀錄，別人的不算", () => {
  const other: Log = { actionId: "b", day: TODAY, occurredAt: new Date(), value: 1 };
  assert.equal(todayState(habit("daily"), [other], TODAY), "due");
});

test("tally 的分母是今天清單上的，idle 與 mantra 都不進去", () => {
  assert.deepEqual(tally(["due", "done", "done", "idle", "mantra"]), { done: 2, total: 3 });
  assert.deepEqual(tally(["idle", "mantra"]), { done: 0, total: 0 });
  assert.deepEqual(tally([]), { done: 0, total: 0 });
});

test("今天做完不能讓分母縮水", () => {
  // 同一項每週型行為，今天做之前與做之後，都必須留在清單裡。
  const before = todayState(habit("weekly"), [], TODAY);
  const after = todayState(habit("weekly"), [log(TODAY)], TODAY);
  assert.deepEqual(tally([before]), { done: 0, total: 1 });
  assert.deepEqual(tally([after]), { done: 1, total: 1 });
});
