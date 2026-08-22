// 純資料操作，不碰 Next 的東西（revalidatePath / redirect）。
// 抽出來是為了能在 Next 請求脈絡外被整合測試呼叫，見 db/write-path.test.ts。
import { and, eq } from "drizzle-orm";
import { getDb } from "./index.ts";
import { actions, logs, plans, subGoals } from "./schema.ts";
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
    .onConflictDoUpdate({ target: [subGoals.planId, subGoals.position], set: { title } });
}

export async function upsertAction({ subGoalId, position, title, trackingType, target }: ActionInput) {
  await getDb()
    .insert(actions)
    .values({ id: crypto.randomUUID(), subGoalId, position, title, trackingType, target })
    .onConflictDoUpdate({
      target: [actions.subGoalId, actions.position],
      set: { title, trackingType, target },
    });
}

export async function findAction(id: string) {
  const [row] = await getDb().select().from(actions).where(eq(actions.id, id));
  return row;
}

/**
 * 寫一筆執行紀錄。回傳 false 代表「daily 今天已經打過卡了，沒有寫入」。
 *
 * ponytail: daily 的同日冪等用「先查再寫」保證，沒有下 DB 唯一索引——
 * 唯一索引只對 daily 正確，但索引不能只套一種 trackingType。單人 app 沒有並行寫入。
 * 見 docs/decisions/0004-single-log-table.md。
 */
export async function logOnce({ actionId, trackingType, day, value }: LogInput): Promise<boolean> {
  if (trackingType === "daily") {
    const [existing] = await getDb()
      .select({ id: logs.id })
      .from(logs)
      .where(and(eq(logs.actionId, actionId), eq(logs.day, day)));
    if (existing) return false;
  }
  await getDb().insert(logs).values({ id: crypto.randomUUID(), actionId, day, value });
  return true;
}

/** 連同底下的次目標、行為、紀錄一起刪（靠 FK cascade）。 */
export async function deletePlan(planId: string) {
  await getDb().delete(plans).where(eq(plans.id, planId));
}
