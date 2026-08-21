"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/index.ts";
import { actions, logs, plans, subGoals } from "@/db/schema.ts";
import { actionInput, logInput, planInput, subGoalInput } from "@/lib/schemas.ts";

export type Result = { error?: string };

/** Zod 的錯誤訊息攤平成一行給表單顯示。 */
function fail(e: { issues: { message: string }[] }): Result {
  return { error: e.issues.map((i) => i.message).join("；") };
}

const str = (f: FormData, k: string) => String(f.get(k) ?? "");
const num = (f: FormData, k: string) => Number(str(f, k));

export async function createPlan(_prev: Result, form: FormData): Promise<Result> {
  const parsed = planInput.safeParse({ title: str(form, "title") });
  if (!parsed.success) return fail(parsed.error);

  const id = crypto.randomUUID();
  await getDb().insert(plans).values({ id, title: parsed.data.title });
  redirect(`/plans/${id}`);
}

export async function saveSubGoal(_prev: Result, form: FormData): Promise<Result> {
  const parsed = subGoalInput.safeParse({
    planId: str(form, "planId"),
    position: num(form, "position"),
    title: str(form, "title"),
  });
  if (!parsed.success) return fail(parsed.error);
  const { planId, position, title } = parsed.data;

  await getDb()
    .insert(subGoals)
    .values({ id: crypto.randomUUID(), planId, position, title })
    .onConflictDoUpdate({ target: [subGoals.planId, subGoals.position], set: { title } });

  revalidatePath(`/plans/${planId}`);
  return {};
}

export async function saveAction(_prev: Result, form: FormData): Promise<Result> {
  const rawTarget = str(form, "target");
  const parsed = actionInput.safeParse({
    subGoalId: str(form, "subGoalId"),
    position: num(form, "position"),
    title: str(form, "title"),
    trackingType: str(form, "trackingType"),
    ...(rawTarget === "" ? {} : { target: Number(rawTarget) }),
  });
  if (!parsed.success) return fail(parsed.error);
  const { subGoalId, position, title, trackingType, target } = parsed.data;

  await getDb()
    .insert(actions)
    .values({ id: crypto.randomUUID(), subGoalId, position, title, trackingType, target })
    .onConflictDoUpdate({
      target: [actions.subGoalId, actions.position],
      set: { title, trackingType, target },
    });

  revalidatePath(str(form, "planId") ? `/plans/${str(form, "planId")}` : "/");
  return {};
}

export async function logProgress(_prev: Result, form: FormData): Promise<Result> {
  const [action] = await getDb().select().from(actions).where(eq(actions.id, str(form, "actionId")));
  if (!action) return { error: "找不到這項行為" };

  const raw = str(form, "value");
  const parsed = logInput.safeParse({
    actionId: action.id,
    trackingType: action.trackingType,
    day: str(form, "day"),
    value: action.trackingType === "daily" ? 1 : Number(raw),
  });
  if (!parsed.success) return fail(parsed.error);
  const { actionId, day, value } = parsed.data;

  // ponytail: daily 的同日冪等在這裡用「先查再寫」保證，沒有下 DB 唯一索引——
  // 唯一索引只對 daily 正確，但索引不能只套一種 trackingType。單人 app 沒有並行寫入。
  // 見 docs/decisions/0004-single-log-table.md。
  if (action.trackingType === "daily") {
    const [existing] = await getDb()
      .select({ id: logs.id })
      .from(logs)
      .where(and(eq(logs.actionId, actionId), eq(logs.day, day)));
    if (existing) return {};
  }

  await getDb().insert(logs).values({ id: crypto.randomUUID(), actionId, day, value });
  revalidatePath(str(form, "planId") ? `/plans/${str(form, "planId")}` : "/");
  return {};
}
