// 整合測試：對真實資料庫驗證兩件單元測試碰不到、型別也保證不了的事——
// upsert 有沒有命中唯一索引、daily 的同日冪等有沒有生效。
// 沒有 DATABASE_URL 就整組跳過（CI 與離線時），有的話會建一份暫時的計劃表，
// 測完連同底下的資料一起刪掉。
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "./index.ts";
import { actions, logs, plans, subGoals } from "./schema.ts";
import {
  deletePlan, insertPlan, logOnce, removeAction, removeSubGoal, renamePlan, upsertAction, upsertSubGoal,
} from "./writes.ts";

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
    await upsertAction({ subGoalId, position: 0, title: "跑步", trackingType: "habit", cadence: "daily", target: null });
    await upsertAction({ subGoalId, position: 0, title: "跑步", trackingType: "quota", cadence: null, target: 10 });

    const rows = await getDb()
      .select()
      .from(actions)
      .where(and(eq(actions.subGoalId, subGoalId), eq(actions.position, 0)));
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.trackingType, "quota");
    assert.equal(rows[0]!.target, 10);
    assert.equal(rows[0]!.cadence, null, "換成累計型時，原本的頻率要被清掉");
  });

  test("習慣型同一期打兩次只留一筆", async () => {
    await upsertAction({ subGoalId, position: 1, title: "冥想", trackingType: "habit", cadence: "daily", target: null });
    const [action] = await getDb()
      .select()
      .from(actions)
      .where(and(eq(actions.subGoalId, subGoalId), eq(actions.position, 1)));

    const first = await logOnce({ actionId: action!.id, trackingType: "habit", cadence: "daily", day: DAY, value: 1 });
    const second = await logOnce({ actionId: action!.id, trackingType: "habit", cadence: "daily", day: DAY, value: 1 });

    assert.equal(first, true, "第一次要寫進去");
    assert.equal(second, false, "第二次要被擋掉");
    const rows = await getDb()
      .select()
      .from(logs)
      .where(and(eq(logs.actionId, action!.id), eq(logs.day, DAY)));
    assert.equal(rows.length, 1);
  });

  test("累計型同一天可以記多次，不該被冪等擋掉", async () => {
    await upsertAction({ subGoalId, position: 2, title: "讀書", trackingType: "quota", cadence: null, target: 10 });
    const [action] = await getDb()
      .select()
      .from(actions)
      .where(and(eq(actions.subGoalId, subGoalId), eq(actions.position, 2)));

    assert.equal(await logOnce({ actionId: action!.id, trackingType: "quota", cadence: null, day: DAY, value: 2 }), true);
    assert.equal(await logOnce({ actionId: action!.id, trackingType: "quota", cadence: null, day: DAY, value: 3 }), true);

    const rows = await getDb()
      .select()
      .from(logs)
      .where(and(eq(logs.actionId, action!.id), eq(logs.day, DAY)));
    assert.equal(rows.length, 2, "累計型不是冪等的，兩筆都要留");
  });

  test("改核心目標名稱是更新同一列", async () => {
    await renamePlan(planId, "__integration_test__ 改過名字");
    const rows = await getDb().select().from(plans).where(eq(plans.id, planId));
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.title, "__integration_test__ 改過名字");
  });

  test("沒打過卡的行為直接刪掉，不留封存列", async () => {
    await upsertAction({ subGoalId, position: 5, title: "沒打過卡", trackingType: "habit", cadence: "daily", target: null });
    const [action] = await getDb()
      .select()
      .from(actions)
      .where(and(eq(actions.subGoalId, subGoalId), eq(actions.position, 5)));

    assert.equal(await removeAction(action!.id), "deleted");
    const rows = await getDb().select().from(actions).where(eq(actions.id, action!.id));
    assert.equal(rows.length, 0, "沒有歷史可失，就該真的刪掉");
  });

  test("打過卡的行為改成封存，紀錄一筆都不能少", async () => {
    await upsertAction({ subGoalId, position: 6, title: "打過卡", trackingType: "habit", cadence: "daily", target: null });
    const [action] = await getDb()
      .select()
      .from(actions)
      .where(and(eq(actions.subGoalId, subGoalId), eq(actions.position, 6)));
    await logOnce({ actionId: action!.id, trackingType: "habit", cadence: "daily", day: DAY, value: 1 });

    assert.equal(await removeAction(action!.id), "archived");
    const [row] = await getDb().select().from(actions).where(eq(actions.id, action!.id));
    assert.ok(row, "封存不是刪除，列還要在");
    assert.ok(row!.archivedAt instanceof Date, "archivedAt 要被填上");
    const kept = await getDb().select().from(logs).where(eq(logs.actionId, action!.id));
    assert.equal(kept.length, 1, "紀錄不能跟著消失");
  });

  test("封存過的格子不佔位置，重填會拿到全新的一列", async () => {
    // 承上：position 6 已經有一列封存的行為，條件式唯一索引應該讓新的一列插得進去。
    await upsertAction({ subGoalId, position: 6, title: "重新填", trackingType: "milestone", cadence: null, target: null });

    const live = await getDb()
      .select()
      .from(actions)
      .where(and(eq(actions.subGoalId, subGoalId), eq(actions.position, 6), isNull(actions.archivedAt)));
    assert.equal(live.length, 1, "同一個位置只能有一列還在用的");
    assert.equal(live[0]!.title, "重新填");
    const logsOfNew = await getDb().select().from(logs).where(eq(logs.actionId, live[0]!.id));
    assert.equal(logsOfNew.length, 0, "新的一列不該撿回封存那列的紀錄");
  });

  test("次目標封存時，底下的行為要一起封存", async () => {
    await upsertSubGoal({ planId, position: 5, title: "要被封存的次目標" });
    const [sg] = await getDb()
      .select()
      .from(subGoals)
      .where(and(eq(subGoals.planId, planId), eq(subGoals.position, 5), isNull(subGoals.archivedAt)));
    await upsertAction({ subGoalId: sg!.id, position: 0, title: "底下的行為", trackingType: "habit", cadence: "daily", target: null });
    const [act] = await getDb().select().from(actions).where(eq(actions.subGoalId, sg!.id));
    await logOnce({ actionId: act!.id, trackingType: "habit", cadence: "daily", day: DAY, value: 1 });

    assert.equal(await removeSubGoal(sg!.id), "archived");
    const [sgAfter] = await getDb().select().from(subGoals).where(eq(subGoals.id, sg!.id));
    const [actAfter] = await getDb().select().from(actions).where(eq(actions.id, act!.id));
    assert.ok(sgAfter!.archivedAt, "次目標要被封存");
    assert.ok(actAfter!.archivedAt, "底下的行為也要，否則位置還被佔著");
    const kept = await getDb().select().from(logs).where(eq(logs.actionId, act!.id));
    assert.equal(kept.length, 1);
  });
});
