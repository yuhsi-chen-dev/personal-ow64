// 純資料操作，不碰 Next 的東西（revalidatePath / redirect）。
// 抽出來是為了能在 Next 請求脈絡外被整合測試呼叫，見 db/write-path.test.ts。
import { eq } from "drizzle-orm";
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
    .onConflictDoUpdate({ target: [subGoals.planId, subGoals.position], set: { title } });
}

export async function upsertAction({ subGoalId, position, title, trackingType, cadence, target }: ActionInput) {
  await getDb()
    .insert(actions)
    .values({ id: crypto.randomUUID(), subGoalId, position, title, trackingType, cadence, target })
    .onConflictDoUpdate({
      target: [actions.subGoalId, actions.position],
      set: { title, trackingType, cadence, target },
    });
}

export async function findAction(id: string) {
  const [row] = await getDb().select().from(actions).where(eq(actions.id, id));
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
