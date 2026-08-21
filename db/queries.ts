import { asc, eq, inArray } from "drizzle-orm";
import { getDb } from "./index.ts";
import { actions, logs, plans, subGoals } from "./schema.ts";

export async function listPlans() {
  return getDb().select().from(plans).orderBy(asc(plans.createdAt));
}

export type LoadedPlan = Awaited<ReturnType<typeof loadPlan>>;

/**
 * 一份計劃表的全部內容。計劃表允許未填滿，所以回傳的 subGoals／actions
 * 是稀疏的，呼叫端要自己對 position 做查找，不要假設有 8 筆或 64 筆。
 */
export async function loadPlan(planId: string) {
  const [plan] = await getDb().select().from(plans).where(eq(plans.id, planId));
  if (!plan) return null;

  const sgs = await getDb().select().from(subGoals).where(eq(subGoals.planId, planId));
  const acts = sgs.length
    ? await getDb().select().from(actions).where(inArray(actions.subGoalId, sgs.map((s) => s.id)))
    : [];
  const lgs = acts.length
    ? await getDb().select().from(logs).where(inArray(logs.actionId, acts.map((a) => a.id)))
    : [];

  return { plan, subGoals: sgs, actions: acts, logs: lgs };
}
