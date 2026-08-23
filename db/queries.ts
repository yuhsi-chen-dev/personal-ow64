import { and, asc, countDistinct, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "./index.ts";
import { actions, logs, plans, subGoals } from "./schema.ts";

/**
 * 計劃表清單，每份帶上「刪掉會失去什麼」的三個數字。
 *
 * 這裡**不濾封存**：刪整份計劃表是 cascade 真刪，封存的次目標與行為也一起走。
 * 確認畫面要講的是真正的代價，不是盤面上看得到的部分。
 */
export async function listPlans(userId: string) {
  const rows = await getDb()
    .select()
    .from(plans)
    .where(eq(plans.userId, userId))
    .orderBy(asc(plans.createdAt));
  if (rows.length === 0) return [];

  const counts = await getDb()
    .select({
      planId: subGoals.planId,
      subGoals: countDistinct(subGoals.id),
      actions: countDistinct(actions.id),
      logs: countDistinct(logs.id),
    })
    .from(subGoals)
    .leftJoin(actions, eq(actions.subGoalId, subGoals.id))
    .leftJoin(logs, eq(logs.actionId, actions.id))
    // 只數自己的。不限制的話會把別人的計劃表也數進來——雖然數字不會被顯示，
    // 但查詢本身就不該碰到不屬於這個使用者的列。
    .where(inArray(subGoals.planId, rows.map((p) => p.id)))
    .groupBy(subGoals.planId);

  const byPlan = new Map(counts.map(({ planId, ...n }) => [planId, n]));
  return rows.map((p) => ({
    ...p,
    // 全新的計劃表一列都沒有，撈不到那一組 count，補 0 而不是讓它變 undefined。
    counts: byPlan.get(p.id) ?? { subGoals: 0, actions: 0, logs: 0 },
  }));
}

export type LoadedPlan = Awaited<ReturnType<typeof loadPlan>>;

/**
 * 一份計劃表的全部內容。計劃表允許未填滿，所以回傳的 subGoals／actions
 * 是稀疏的，呼叫端要自己對 position 做查找，不要假設有 8 筆或 64 筆。
 *
 * 已封存的次目標與行為一律不回傳——盤面上它們就是不存在。
 * 它們的紀錄還在資料庫裡，要看的話走 loadPlanLogs。
 */
export async function loadPlan(userId: string, planId: string) {
  const [plan] = await getDb()
    .select()
    .from(plans)
    .where(and(eq(plans.id, planId), eq(plans.userId, userId)));
  // 不是他的就回 null，跟「不存在」同一個結果——不要讓呼叫端有辦法分辨這兩者。
  if (!plan) return null;

  const sgs = await getDb()
    .select()
    .from(subGoals)
    .where(and(eq(subGoals.planId, planId), isNull(subGoals.archivedAt)));
  const acts = sgs.length
    ? await getDb()
        .select()
        .from(actions)
        .where(and(inArray(actions.subGoalId, sgs.map((s) => s.id)), isNull(actions.archivedAt)))
    : [];
  const lgs = acts.length
    ? await getDb().select().from(logs).where(inArray(logs.actionId, acts.map((a) => a.id)))
    : [];

  return { plan, subGoals: sgs, actions: acts, logs: lgs };
}

/**
 * 這份計劃表的**所有**打卡紀錄，含已封存的次目標與行為。
 * 回顧頁的年度熱圖用這個：封存一格不該讓那段日子從歷史上消失。
 */
export async function loadPlanLogs(userId: string, planId: string) {
  return getDb()
    .select({ actionId: logs.actionId, day: logs.day, occurredAt: logs.occurredAt, value: logs.value })
    .from(logs)
    .innerJoin(actions, eq(actions.id, logs.actionId))
    .innerJoin(subGoals, eq(subGoals.id, actions.subGoalId))
    .innerJoin(plans, eq(plans.id, subGoals.planId))
    .where(and(eq(subGoals.planId, planId), eq(plans.userId, userId)));
}
