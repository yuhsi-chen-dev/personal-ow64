"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  deletePlan, findAction, insertPlan, logOnce, removeAction, removeSubGoal, renamePlan,
  upsertAction, upsertSubGoal,
} from "@/db/writes.ts";
import {
  actionInput, logInput, planIdInput, planInput, planRenameInput, removeInput, subGoalInput,
} from "@/lib/schemas.ts";

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

  redirect(`/plans/${await insertPlan(parsed.data.title)}`);
}

export async function saveSubGoal(_prev: Result, form: FormData): Promise<Result> {
  const parsed = subGoalInput.safeParse({
    planId: str(form, "planId"),
    position: num(form, "position"),
    title: str(form, "title"),
  });
  if (!parsed.success) return fail(parsed.error);

  await upsertSubGoal(parsed.data);
  revalidatePath(`/plans/${parsed.data.planId}`, "layout");
  return {};
}

export async function saveAction(_prev: Result, form: FormData): Promise<Result> {
  // 頻率與目標數量在表單上一直存在，但各自只有 habit／quota 用得到。
  // 其餘型態直接丟掉使用者填的值，不要拿去驗證然後回一個他看不懂的錯。
  const rawType = str(form, "trackingType");
  const rawTarget = str(form, "target");
  const parsed = actionInput.safeParse({
    subGoalId: str(form, "subGoalId"),
    position: num(form, "position"),
    title: str(form, "title"),
    trackingType: rawType,
    ...(rawType === "habit" ? { cadence: str(form, "cadence") || "daily" } : {}),
    ...(rawType === "quota" && rawTarget !== "" ? { target: Number(rawTarget) } : {}),
  });
  if (!parsed.success) return fail(parsed.error);

  await upsertAction(parsed.data);
  // 一次打卡同時改變格子頁、今天頁與回顧頁，所以 revalidate 整個 layout 底下。
  revalidatePath(str(form, "planId") ? `/plans/${str(form, "planId")}` : "/", "layout");
  return {};
}

export async function logProgress(_prev: Result, form: FormData): Promise<Result> {
  const action = await findAction(str(form, "actionId"));
  if (!action) return { error: "找不到這項行為" };

  const parsed = logInput.safeParse({
    actionId: action.id,
    trackingType: action.trackingType,
    day: str(form, "day"),
    // 只有累計型會用到使用者填的數量，其餘型態一次就是一次。
    value: action.trackingType === "quota" ? Number(str(form, "value")) : 1,
  });
  if (!parsed.success) return fail(parsed.error);

  await logOnce({ ...parsed.data, cadence: action.cadence });
  // 一次打卡同時改變格子頁、今天頁與回顧頁，所以 revalidate 整個 layout 底下。
  revalidatePath(str(form, "planId") ? `/plans/${str(form, "planId")}` : "/", "layout");
  return {};
}

export async function renamePlanTitle(_prev: Result, form: FormData): Promise<Result> {
  const parsed = planRenameInput.safeParse({ planId: str(form, "planId"), title: str(form, "title") });
  if (!parsed.success) return fail(parsed.error);

  await renamePlan(parsed.data.planId, parsed.data.title);
  revalidatePath(`/plans/${parsed.data.planId}`, "layout");
  revalidatePath("/");
  return {};
}

/** 刪掉整份計劃表，連同底下的次目標、行為、紀錄（FK cascade）。不可復原。 */
export async function removePlan(_prev: Result, form: FormData): Promise<Result> {
  const parsed = planIdInput.safeParse({ planId: str(form, "planId") });
  if (!parsed.success) return fail(parsed.error);

  await deletePlan(parsed.data.planId);
  revalidatePath("/");
  redirect("/");
}

/**
 * 移除一個次目標或一項行為。打過卡的封存、沒打過的直接刪，
 * 判斷在 db/writes.ts，見 docs/decisions/0009-soft-delete.md。
 */
export async function removeSubGoalCell(_prev: Result, form: FormData): Promise<Result> {
  const parsed = removeInput.safeParse({ id: str(form, "id"), planId: str(form, "planId") });
  if (!parsed.success) return fail(parsed.error);

  await removeSubGoal(parsed.data.id);
  revalidatePath(`/plans/${parsed.data.planId}`, "layout");
  return {};
}

export async function removeActionCell(_prev: Result, form: FormData): Promise<Result> {
  const parsed = removeInput.safeParse({ id: str(form, "id"), planId: str(form, "planId") });
  if (!parsed.success) return fail(parsed.error);

  await removeAction(parsed.data.id);
  revalidatePath(`/plans/${parsed.data.planId}`, "layout");
  return {};
}
