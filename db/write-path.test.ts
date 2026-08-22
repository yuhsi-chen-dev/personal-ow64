// 整合測試：對真實資料庫驗證兩件單元測試碰不到、型別也保證不了的事——
// upsert 有沒有命中唯一索引、daily 的同日冪等有沒有生效。
// 沒有 DATABASE_URL 就整組跳過（CI 與離線時），有的話會建一份暫時的計劃表，
// 測完連同底下的資料一起刪掉。
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { getDb } from "./index.ts";
import { actions, logs, subGoals } from "./schema.ts";
import { deletePlan, insertPlan, logOnce, upsertAction, upsertSubGoal } from "./writes.ts";

const skip = process.env.DATABASE_URL ? false : "沒有 DATABASE_URL，跳過整合測試";
const DAY = "2020-01-01"; // 固定的過去日期，不會跟真實打卡撞在一起

describe("寫入路徑（真實資料庫）", { skip }, () => {
  let planId: string;
  let subGoalId: string;

  before(async () => {
    planId = await insertPlan("__integration_test__ 請忽略");
  });

  after(async () => {
    // 靠 FK cascade 把次目標、行為、紀錄一起帶走
    if (planId) await deletePlan(planId);
  });

  test("同一個 slot 存兩次是更新，不是新增（upsert 命中唯一索引）", async () => {
    await upsertSubGoal({ planId, position: 3, title: "第一版" });
    await upsertSubGoal({ planId, position: 3, title: "第二版" });

    const rows = await getDb()
      .select()
      .from(subGoals)
      .where(and(eq(subGoals.planId, planId), eq(subGoals.position, 3)));
    assert.equal(rows.length, 1, "同一個 position 不該有兩列");
    assert.equal(rows[0]!.title, "第二版");
    subGoalId = rows[0]!.id;
  });

  test("行為改追蹤方式也是更新，target 跟著換掉", async () => {
    await upsertAction({ subGoalId, position: 0, title: "跑步", trackingType: "daily", target: null });
    await upsertAction({ subGoalId, position: 0, title: "跑步", trackingType: "count", target: 10 });

    const rows = await getDb()
      .select()
      .from(actions)
      .where(and(eq(actions.subGoalId, subGoalId), eq(actions.position, 0)));
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.trackingType, "count");
    assert.equal(rows[0]!.target, 10);
  });

  test("daily 同一天打兩次卡只留一筆", async () => {
    await upsertAction({ subGoalId, position: 1, title: "冥想", trackingType: "daily", target: null });
    const [action] = await getDb()
      .select()
      .from(actions)
      .where(and(eq(actions.subGoalId, subGoalId), eq(actions.position, 1)));

    const first = await logOnce({ actionId: action!.id, trackingType: "daily", day: DAY, value: 1 });
    const second = await logOnce({ actionId: action!.id, trackingType: "daily", day: DAY, value: 1 });

    assert.equal(first, true, "第一次要寫進去");
    assert.equal(second, false, "第二次要被擋掉");
    const rows = await getDb()
      .select()
      .from(logs)
      .where(and(eq(logs.actionId, action!.id), eq(logs.day, DAY)));
    assert.equal(rows.length, 1);
  });

  test("count 同一天可以打多次，不該被冪等擋掉", async () => {
    await upsertAction({ subGoalId, position: 2, title: "讀書", trackingType: "count", target: 10 });
    const [action] = await getDb()
      .select()
      .from(actions)
      .where(and(eq(actions.subGoalId, subGoalId), eq(actions.position, 2)));

    assert.equal(await logOnce({ actionId: action!.id, trackingType: "count", day: DAY, value: 2 }), true);
    assert.equal(await logOnce({ actionId: action!.id, trackingType: "count", day: DAY, value: 3 }), true);

    const rows = await getDb()
      .select()
      .from(logs)
      .where(and(eq(logs.actionId, action!.id), eq(logs.day, DAY)));
    assert.equal(rows.length, 2, "count 不是冪等的，兩筆都要留");
  });
});
