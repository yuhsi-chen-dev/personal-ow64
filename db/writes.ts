// 純資料操作，不碰 Next 的東西（revalidatePath / redirect）。
// 抽出來是為了能在 Next 請求脈絡外被整合測試呼叫，見 db/write-path.test.ts。
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "./index.ts";
import { actions, logs, plans, subGoals } from "./schema.ts";
import { periodKey, type Cadence } from "../lib/day.ts";
import type { ActionInput, LogInput, SubGoalInput } from "../lib/schemas.ts";

export async function insertPlan(title: string): Promise<string> {
  const id = crypto.randomUUID();
  await getDb().insert(plans).values({ id, title });
  return id;
}

export async function upsertSubGoal({ planId, position, title }: SubGoalInput) {
  await getDb()
    .insert(subGoals)
    .values({ id: crypto.randomUUID(), planId, position, title })
    .onConflictDoUpdate({
      target: [subGoals.planId, subGoals.position],
      targetWhere: isNull(subGoals.archivedAt), // 索引是條件式的，這裡要一模一樣才對得上
      set: { title },
    });
}

export async function upsertAction({ subGoalId, position, title, trackingType, cadence, target }: ActionInput) {
  await getDb()
    .insert(actions)
    .values({ id: crypto.randomUUID(), subGoalId, position, title, trackingType, cadence, target })
    .onConflictDoUpdate({
      target: [actions.subGoalId, actions.position],
      targetWhere: isNull(actions.archivedAt),
      set: { title, trackingType, cadence, target },
    });
}

export async function findAction(id: string) {
  const [row] = await getDb().select().from(actions).where(and(eq(actions.id, id), isNull(actions.archivedAt)));
  return row;
}

/**
 * 寫一筆執行紀錄。回傳 false 代表「本期已經記過了，沒有寫入」。
 *
 * 冪等的範圍跟著型態走：habit 是當期（今天／本週／本月）、milestone 是永遠只有一次、
 * quota 每次都要累加所以不冪等。
 *
 * ponytail: 用「先查再寫」保證，沒有下 DB 唯一索引——唯一索引只對某些 trackingType
 * 正確，索引不能只套一部分列。單人 app 沒有並行寫入。
 * 見 docs/decisions/0004-single-log-table.md。
 */
export async function logOnce({ actionId, trackingType, cadence, day, value }: LogInput & { cadence: Cadence | null }): Promise<boolean> {
  if (trackingType === "mantra") return false;

  if (trackingType === "habit" || trackingType === "milestone") {
    const existing = await getDb().select({ day: logs.day }).from(logs).where(eq(logs.actionId, actionId));
    const already =
      trackingType === "milestone"
        ? existing.length > 0
        : existing.some((l) => periodKey(l.day, cadence ?? "daily") === periodKey(day, cadence ?? "daily"));
    if (already) return false;
  }

  await getDb().insert(logs).values({ id: crypto.randomUUID(), actionId, day, value });
  return true;
}

/** 連同底下的次目標、行為、紀錄一起刪（靠 FK cascade）。 */
export async function deletePlan(planId: string) {
  await getDb().delete(plans).where(eq(plans.id, planId));
}

export async function renamePlan(planId: string, title: string) {
  await getDb().update(plans).set({ title }).where(eq(plans.id, planId));
}

/** 這一格底下有沒有任何紀錄。有的話就不能硬刪，見 docs/decisions/0009-soft-delete.md。 */
async function hasLogs(actionIds: string[]): Promise<boolean> {
  if (actionIds.length === 0) return false;
  const rows = await getDb().select({ id: logs.id }).from(logs).where(inArray(logs.actionId, actionIds)).limit(1);
  return rows.length > 0;
}

/**
 * 移除一項行為：沒打過卡就直接刪掉（沒有歷史可失），打過卡就封存。
 * 回傳實際做了哪一種，讓呼叫端能照實告訴使用者。
 */
export async function removeAction(id: string): Promise<"deleted" | "archived"> {
  if (await hasLogs([id])) {
    await getDb().update(actions).set({ archivedAt: new Date() }).where(eq(actions.id, id));
    return "archived";
  }
  await getDb().delete(actions).where(eq(actions.id, id));
  return "deleted";
}

/** 移除一個次目標，連同底下 8 項行為。判準與 removeAction 相同：有紀錄就封存。 */
export async function removeSubGoal(id: string): Promise<"deleted" | "archived"> {
  const mine = await getDb().select({ id: actions.id }).from(actions).where(eq(actions.subGoalId, id));
  if (await hasLogs(mine.map((a) => a.id))) {
    const at = new Date();
    // 次目標封存了，底下的行為也要一起封存——否則重填這一格之後，
    // 舊行為會掛在看不見的次目標底下，位置卻還被佔著。
    await getDb().update(actions).set({ archivedAt: at }).where(eq(actions.subGoalId, id));
    await getDb().update(subGoals).set({ archivedAt: at }).where(eq(subGoals.id, id));
    return "archived";
  }
  await getDb().delete(subGoals).where(eq(subGoals.id, id)); // 底下的行為靠 FK cascade
  return "deleted";
}
