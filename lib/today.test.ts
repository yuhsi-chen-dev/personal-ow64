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

test("一期要做 3 次：沒做滿就還是 due，做滿才退場", () => {
  const thrice: Action = { id: "a", trackingType: "habit", cadence: "weekly", timesPerPeriod: 3 };
  // 2026-08-17 是同一週的星期一
  assert.equal(todayState(thrice, [log("2026-08-17")], TODAY), "due", "本週才 1/3，不能從清單上消失");
  assert.equal(todayState(thrice, [log("2026-08-17"), log(TODAY)], TODAY), "due", "今天做了但本週還差一次");
  assert.equal(
    todayState(thrice, [log("2026-08-17"), log("2026-08-18"), log(TODAY)], TODAY),
    "done",
    "今天做滿第三次，要留在今天的清單裡",
  );
  assert.equal(
    todayState(thrice, [log("2026-08-17"), log("2026-08-18"), log("2026-08-18")], TODAY),
    "idle",
    "本週稍早就做滿了，今天沒它的事",
  );
});

test("里程碑：沒做過是 open（不計分），今天完成是 done，以前完成的就不再出現", () => {
  const m: Action = { id: "a", trackingType: "milestone" };
  assert.equal(todayState(m, [], TODAY), "open", "沒有週期就沒有今天的應做量");
  assert.equal(todayState(m, [log(TODAY)], TODAY), "done", "今天真的完成了才進今天的分數");
  assert.equal(todayState(m, [log("2026-01-01")], TODAY), "idle");
});

test("累計型：沒到目標是 open（不計分），今天加過才進分數", () => {
  const q = (target: number | null): Action => ({ id: "a", trackingType: "quota", target });
  assert.equal(todayState(q(10), [], TODAY), "open", "沒有週期就沒有今天的應做量");
  assert.equal(todayState(q(10), [log(TODAY, 3)], TODAY), "done", "今天加過就是 done，但還沒到目標");
  assert.equal(todayState(q(10), [log("2026-08-01", 4)], TODAY), "open", "以前加過但沒到目標，今天仍然只是可以推進");
  assert.equal(todayState(q(10), [log("2026-08-01", 10)], TODAY), "idle", "早就達標，今天沒它的事");
  assert.equal(todayState(q(10), [log("2026-08-01", 7), log(TODAY, 3)], TODAY), "done", "今天達標，今天之內維持 done");
  assert.equal(todayState(q(null), [log(TODAY, 99)], TODAY), "done", "沒設目標就永遠到不了，不會變 idle");
});

test("沒有週期的目標不能佔住今天的分母——不然那條進度條永遠不會滿", () => {
  const milestone: Action = { id: "m", trackingType: "milestone" };
  const quota: Action = { id: "q", trackingType: "quota", target: 500 };
  const daily = habit("daily");
  const states = [milestone, quota, daily].map((a) => todayState(a, [], TODAY));
  assert.deepEqual(states, ["open", "open", "due"]);
  // 只有那個每日習慣算數：做完它就是 1/1，不會被一年期的目標卡在 1/3。
  assert.deepEqual(tally(states), { done: 0, total: 1 });
});

test("只算自己的紀錄，別人的不算", () => {
  const other: Log = { actionId: "b", day: TODAY, occurredAt: new Date(), value: 1 };
  assert.equal(todayState(habit("daily"), [other], TODAY), "due");
});

test("tally 的分母是今天清單上的，open、idle 與 mantra 都不進去", () => {
  assert.deepEqual(tally(["due", "done", "done", "open", "idle", "mantra"]), { done: 2, total: 3 });
  assert.deepEqual(tally(["open", "idle", "mantra"]), { done: 0, total: 0 });
  assert.deepEqual(tally([]), { done: 0, total: 0 });
});

test("今天做完不能讓分母縮水", () => {
  // 同一項每週型行為，今天做之前與做之後，都必須留在清單裡。
  const before = todayState(habit("weekly"), [], TODAY);
  const after = todayState(habit("weekly"), [log(TODAY)], TODAY);
  assert.deepEqual(tally([before]), { done: 0, total: 1 });
  assert.deepEqual(tally([after]), { done: 1, total: 1 });
});
