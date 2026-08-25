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
  NotYours, deletePlan, findAction, insertPlan, logOnce, removeAction, removeSubGoal, renamePlan, undoLog,
  upsertAction, upsertSubGoal,
} from "./writes.ts";
import { listPlans, loadPlan, loadPlanLogs } from "./queries.ts";

const skip = process.env.DATABASE_URL ? false : "沒有 DATABASE_URL，跳過整合測試";
const DAY = "2020-01-01"; // 固定的過去日期，不會跟真實打卡撞在一起
const A = "__test_user_a__"; // 這些 id 對不上任何真實的 OAuth subject
const B = "__test_user_b__";

describe("寫入路徑（真實資料庫）", { skip }, () => {
  let planId: string;
  let subGoalId: string;

  before(async () => {
    planId = await insertPlan(A, "__integration_test__ 請忽略");
  });

  after(async () => {
    // 靠 FK cascade 把次目標、行為、紀錄一起帶走
    if (planId) await deletePlan(A, planId);
  });

  test("同一個 slot 存兩次是更新，不是新增（upsert 命中唯一索引）", async () => {
    await upsertSubGoal(A, { planId, position: 3, title: "第一版" });
    await upsertSubGoal(A, { planId, position: 3, title: "第二版" });

    const rows = await getDb()
      .select()
      .from(subGoals)
      .where(and(eq(subGoals.planId, planId), eq(subGoals.position, 3)));
    assert.equal(rows.length, 1, "同一個 position 不該有兩列");
    assert.equal(rows[0]!.title, "第二版");
    subGoalId = rows[0]!.id;
  });

  test("行為改追蹤方式也是更新，target 跟著換掉", async () => {
    await upsertAction(A, { subGoalId, position: 0, title: "跑步", trackingType: "habit", cadence: "daily", timesPerPeriod: 1, target: null });
    await upsertAction(A, { subGoalId, position: 0, title: "跑步", trackingType: "quota", cadence: null, timesPerPeriod: null, target: 10 });

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
    await upsertAction(A, { subGoalId, position: 1, title: "冥想", trackingType: "habit", cadence: "daily", timesPerPeriod: 1, target: null });
    const [action] = await getDb()
      .select()
      .from(actions)
      .where(and(eq(actions.subGoalId, subGoalId), eq(actions.position, 1)));

    const first = await logOnce(A, { actionId: action!.id, trackingType: "habit", cadence: "daily", timesPerPeriod: 1, day: DAY, value: 1 });
    const second = await logOnce(A, { actionId: action!.id, trackingType: "habit", cadence: "daily", timesPerPeriod: 1, day: DAY, value: 1 });

    assert.equal(first, true, "第一次要寫進去");
    assert.equal(second, false, "第二次要被擋掉");
    const rows = await getDb()
      .select()
      .from(logs)
      .where(and(eq(logs.actionId, action!.id), eq(logs.day, DAY)));
    assert.equal(rows.length, 1);
  });

  test("一週三次：第二、三次要記得進去，第四次才擋", async () => {
    await upsertAction(A, {
      subGoalId, position: 4, title: "慢跑", trackingType: "habit",
      cadence: "weekly", timesPerPeriod: 3, target: null,
    });
    const [action] = await getDb()
      .select()
      .from(actions)
      .where(and(eq(actions.subGoalId, subGoalId), eq(actions.position, 4)));

    const one = { actionId: action!.id, trackingType: "habit" as const, cadence: "weekly" as const, timesPerPeriod: 3, value: 1 };
    // 同一週的不同天，最後一次故意跟第三次同一天——上限是「一期三次」不是「一天一次」。
    assert.equal(await logOnce(A, { ...one, day: "2026-08-17" }), true);
    assert.equal(await logOnce(A, { ...one, day: "2026-08-18" }), true, "第二次不能被冪等擋掉");
    assert.equal(await logOnce(A, { ...one, day: "2026-08-19" }), true, "第三次不能被冪等擋掉");
    assert.equal(await logOnce(A, { ...one, day: "2026-08-19" }), false, "做滿三次之後才擋");
    // 下一週重新開始
    assert.equal(await logOnce(A, { ...one, day: "2026-08-24" }), true);

    const rows = await getDb().select().from(logs).where(eq(logs.actionId, action!.id));
    assert.equal(rows.length, 4);
  });

  test("撤銷只收回今天的最後一筆，前面的與別天的都要留著", async () => {
    await upsertAction(A, {
      subGoalId, position: 7, title: "喝水", trackingType: "quota",
      cadence: null, timesPerPeriod: null, target: 100,
    });
    const [action] = await getDb()
      .select()
      .from(actions)
      .where(and(eq(actions.subGoalId, subGoalId), eq(actions.position, 7)));

    const one = { actionId: action!.id, trackingType: "quota" as const, cadence: null, timesPerPeriod: null };
    await logOnce(A, { ...one, day: "2026-08-18", value: 1 });
    await logOnce(A, { ...one, day: DAY, value: 2 });
    await logOnce(A, { ...one, day: DAY, value: 3 });

    assert.equal(await undoLog(A, action!.id, DAY), true);
    const left = await getDb().select().from(logs).where(eq(logs.actionId, action!.id));
    assert.deepEqual(
      left.map((l) => `${l.day}:${l.value}`).sort(),
      [`${DAY}:2`, "2026-08-18:1"].sort(),
      "只該少掉今天的最後一筆",
    );

    assert.equal(await undoLog(A, action!.id, DAY), true);
    assert.equal(await undoLog(A, action!.id, DAY), false, "今天沒得撤銷時要回 false，不是丟錯");
    const rest = await getDb().select().from(logs).where(eq(logs.actionId, action!.id));
    assert.equal(rest.length, 1, "別天的紀錄不能被掃到");
  });

  test("累計型同一天可以記多次，不該被冪等擋掉", async () => {
    await upsertAction(A, { subGoalId, position: 2, title: "讀書", trackingType: "quota", cadence: null, timesPerPeriod: null, target: 10 });
    const [action] = await getDb()
      .select()
      .from(actions)
      .where(and(eq(actions.subGoalId, subGoalId), eq(actions.position, 2)));

    assert.equal(await logOnce(A, { actionId: action!.id, trackingType: "quota", cadence: null, timesPerPeriod: null, day: DAY, value: 2 }), true);
    assert.equal(await logOnce(A, { actionId: action!.id, trackingType: "quota", cadence: null, timesPerPeriod: null, day: DAY, value: 3 }), true);

    const rows = await getDb()
      .select()
      .from(logs)
      .where(and(eq(logs.actionId, action!.id), eq(logs.day, DAY)));
    assert.equal(rows.length, 2, "累計型不是冪等的，兩筆都要留");
  });

  test("改核心目標名稱是更新同一列", async () => {
    await renamePlan(A, planId, "__integration_test__ 改過名字");
    const rows = await getDb().select().from(plans).where(eq(plans.id, planId));
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.title, "__integration_test__ 改過名字");
  });

  test("沒打過卡的行為直接刪掉，不留封存列", async () => {
    await upsertAction(A, { subGoalId, position: 5, title: "沒打過卡", trackingType: "habit", cadence: "daily", timesPerPeriod: 1, target: null });
    const [action] = await getDb()
      .select()
      .from(actions)
      .where(and(eq(actions.subGoalId, subGoalId), eq(actions.position, 5)));

    assert.equal(await removeAction(A, action!.id), "deleted");
    const rows = await getDb().select().from(actions).where(eq(actions.id, action!.id));
    assert.equal(rows.length, 0, "沒有歷史可失，就該真的刪掉");
  });

  test("打過卡的行為改成封存，紀錄一筆都不能少", async () => {
    await upsertAction(A, { subGoalId, position: 6, title: "打過卡", trackingType: "habit", cadence: "daily", timesPerPeriod: 1, target: null });
    const [action] = await getDb()
      .select()
      .from(actions)
      .where(and(eq(actions.subGoalId, subGoalId), eq(actions.position, 6)));
    await logOnce(A, { actionId: action!.id, trackingType: "habit", cadence: "daily", timesPerPeriod: 1, day: DAY, value: 1 });

    assert.equal(await removeAction(A, action!.id), "archived");
    const [row] = await getDb().select().from(actions).where(eq(actions.id, action!.id));
    assert.ok(row, "封存不是刪除，列還要在");
    assert.ok(row!.archivedAt instanceof Date, "archivedAt 要被填上");
    const kept = await getDb().select().from(logs).where(eq(logs.actionId, action!.id));
    assert.equal(kept.length, 1, "紀錄不能跟著消失");
  });

  test("封存過的格子不佔位置，重填會拿到全新的一列", async () => {
    // 承上：position 6 已經有一列封存的行為，條件式唯一索引應該讓新的一列插得進去。
    await upsertAction(A, { subGoalId, position: 6, title: "重新填", trackingType: "milestone", cadence: null, timesPerPeriod: null, target: null });

    const live = await getDb()
      .select()
      .from(actions)
      .where(and(eq(actions.subGoalId, subGoalId), eq(actions.position, 6), isNull(actions.archivedAt)));
    assert.equal(live.length, 1, "同一個位置只能有一列還在用的");
    assert.equal(live[0]!.title, "重新填");
    const logsOfNew = await getDb().select().from(logs).where(eq(logs.actionId, live[0]!.id));
    assert.equal(logsOfNew.length, 0, "新的一列不該撿回封存那列的紀錄");
  });

  /* ---------------------------------------------------------------
   * 資料隔離。測的是「B 拿 A 的 id 打進來會被擋下」，
   * 不是「A 自己操作正常」——後者過了完全不代表前者。
   * 見 docs/decisions/0011-multi-tenant.md。
   * ------------------------------------------------------------- */

  test("B 的清單裡沒有 A 的計劃表", async () => {
    const mine = await listPlans(B);
    assert.equal(mine.some((p) => p.id === planId), false);
    const his = await listPlans(A);
    assert.equal(his.some((p) => p.id === planId), true, "A 自己要看得到，不然是過濾寫壞了");
  });

  test("B 讀 A 的計劃表拿到 null，跟不存在同一個結果", async () => {
    assert.equal(await loadPlan(B, planId), null);
    assert.notEqual(await loadPlan(A, planId), null);
    assert.deepEqual(await loadPlanLogs(B, planId), []);
  });

  test("B 不能在 A 的計劃表上寫次目標", async () => {
    await assert.rejects(() => upsertSubGoal(B, { planId, position: 7, title: "入侵" }), NotYours);
    const rows = await getDb()
      .select()
      .from(subGoals)
      .where(and(eq(subGoals.planId, planId), eq(subGoals.position, 7)));
    assert.equal(rows.length, 0, "擋下來就不能留下任何一列");
  });

  test("B 不能在 A 的次目標底下寫行為", async () => {
    await assert.rejects(
      () => upsertAction(B, { subGoalId, position: 7, title: "入侵", trackingType: "milestone", cadence: null, timesPerPeriod: null, target: null }),
      NotYours,
    );
  });

  test("B 看不到也打不了 A 的行為", async () => {
    await upsertAction(A, { subGoalId, position: 3, title: "A 的行為", trackingType: "habit", cadence: "daily", timesPerPeriod: 1, target: null });
    const [action] = await getDb()
      .select()
      .from(actions)
      .where(and(eq(actions.subGoalId, subGoalId), eq(actions.position, 3)));

    assert.equal(await findAction(B, action!.id), undefined, "findAction 要當它不存在");
    await assert.rejects(
      () => logOnce(B, { actionId: action!.id, trackingType: "habit", cadence: "daily", timesPerPeriod: 1, day: DAY, value: 1 }),
      NotYours,
    );
    const rows = await getDb().select().from(logs).where(eq(logs.actionId, action!.id));
    assert.equal(rows.length, 0, "被擋下就不能留下紀錄");

    // 撤銷也是寫入，同一條鐵則：B 不能用 A 的 actionId 刪掉 A 的紀錄。
    await logOnce(A, { actionId: action!.id, trackingType: "habit", cadence: "daily", timesPerPeriod: 1, day: DAY, value: 1 });
    await assert.rejects(() => undoLog(B, action!.id, DAY), NotYours);
    const mine = await getDb().select().from(logs).where(eq(logs.actionId, action!.id));
    assert.equal(mine.length, 1, "A 的紀錄要還在");
  });

  test("B 不能移除 A 的次目標或行為", async () => {
    const [action] = await getDb()
      .select()
      .from(actions)
      .where(and(eq(actions.subGoalId, subGoalId), eq(actions.position, 3)));
    await assert.rejects(() => removeAction(B, action!.id), NotYours);
    await assert.rejects(() => removeSubGoal(B, subGoalId), NotYours);

    const stillThere = await getDb().select().from(actions).where(eq(actions.id, action!.id));
    assert.equal(stillThere.length, 1);
    assert.equal(stillThere[0]!.archivedAt, null, "不能被封存，更不能被刪");
  });

  /**
   * 改名與刪除計劃表是把 userId 直接寫進 WHERE 的，所以**不會丟錯，會靜靜地什麼都不做**。
   * 這種「無聲的失敗」正是最容易矇混過關的：測試必須去看那一列有沒有被動到。
   */
  test("B 改 A 的計劃表名稱：不丟錯，但也不會改到", async () => {
    const [before] = await getDb().select().from(plans).where(eq(plans.id, planId));
    await renamePlan(B, planId, "被入侵了");
    const [after] = await getDb().select().from(plans).where(eq(plans.id, planId));
    assert.equal(after!.title, before!.title);
  });

  test("B 刪 A 的計劃表：不丟錯，但也刪不掉", async () => {
    await deletePlan(B, planId);
    const rows = await getDb().select().from(plans).where(eq(plans.id, planId));
    assert.equal(rows.length, 1, "還在就對了");
  });

  test("次目標封存時，底下的行為要一起封存", async () => {
    await upsertSubGoal(A, { planId, position: 5, title: "要被封存的次目標" });
    const [sg] = await getDb()
      .select()
      .from(subGoals)
      .where(and(eq(subGoals.planId, planId), eq(subGoals.position, 5), isNull(subGoals.archivedAt)));
    await upsertAction(A, { subGoalId: sg!.id, position: 0, title: "底下的行為", trackingType: "habit", cadence: "daily", timesPerPeriod: 1, target: null });
    const [act] = await getDb().select().from(actions).where(eq(actions.subGoalId, sg!.id));
    await logOnce(A, { actionId: act!.id, trackingType: "habit", cadence: "daily", timesPerPeriod: 1, day: DAY, value: 1 });

    assert.equal(await removeSubGoal(A, sg!.id), "archived");
    const [sgAfter] = await getDb().select().from(subGoals).where(eq(subGoals.id, sg!.id));
    const [actAfter] = await getDb().select().from(actions).where(eq(actions.id, act!.id));
    assert.ok(sgAfter!.archivedAt, "次目標要被封存");
    assert.ok(actAfter!.archivedAt, "底下的行為也要，否則位置還被佔著");
    const kept = await getDb().select().from(logs).where(eq(logs.actionId, act!.id));
    assert.equal(kept.length, 1);
  });
});
