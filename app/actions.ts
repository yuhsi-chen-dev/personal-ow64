"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUserId } from "@/auth.ts";
import {
  NotYours, deletePlan, findAction, insertPlan, logOnce, removeAction, removeSubGoal, renamePlan,
  upsertAction, upsertSubGoal,
} from "@/db/writes.ts";
import { loadPlan } from "@/db/queries.ts";
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

/**
 * 每一支 server action 的共同外殼：沒登入擋下、動到別人的東西擋下，
 * 兩種都回成一般的表單錯誤而不是 500。
 *
 * redirect() 是靠丟例外運作的，所以這裡只攔 NotYours，其餘原樣往上丟，
 * 不然 createPlan 與 removePlan 的導向會被吃掉。
 */
async function withUser(run: (userId: string) => Promise<Result>): Promise<Result> {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return { error: "請先登入" };
  }
  try {
    return await run(userId);
  } catch (e) {
    if (e instanceof NotYours) return { error: e.message };
    throw e;
  }
}

export async function createPlan(_prev: Result, form: FormData): Promise<Result> {
  const parsed = planInput.safeParse({ title: str(form, "title") });
  if (!parsed.success) return fail(parsed.error);

  return withUser(async (userId) => {
    redirect(`/plans/${await insertPlan(userId, parsed.data.title)}`);
  });
}

export async function saveSubGoal(_prev: Result, form: FormData): Promise<Result> {
  const parsed = subGoalInput.safeParse({
    planId: str(form, "planId"),
    position: num(form, "position"),
    title: str(form, "title"),
  });
  if (!parsed.success) return fail(parsed.error);

  return withUser(async (userId) => {
    await upsertSubGoal(userId, parsed.data);
    revalidatePath(`/plans/${parsed.data.planId}`, "layout");
    return {};
  });
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

  return withUser(async (userId) => {
    await upsertAction(userId, parsed.data);
    // 一次打卡同時改變格子頁、今天頁與回顧頁，所以 revalidate 整個 layout 底下。
    revalidatePath(str(form, "planId") ? `/plans/${str(form, "planId")}` : "/", "layout");
    return {};
  });
}

export async function logProgress(_prev: Result, form: FormData): Promise<Result> {
  return withUser(async (userId) => {
    // findAction 已經濾過主人，別人的行為在這裡就是「找不到」。
    const action = await findAction(userId, str(form, "actionId"));
    if (!action) return { error: "找不到這項行為" };

    const parsed = logInput.safeParse({
      actionId: action.id,
      trackingType: action.trackingType,
      day: str(form, "day"),
      // 只有累計型會用到使用者填的數量，其餘型態一次就是一次。
      value: action.trackingType === "quota" ? Number(str(form, "value")) : 1,
    });
    if (!parsed.success) return fail(parsed.error);

    await logOnce(userId, { ...parsed.data, cadence: action.cadence });
    // 一次打卡同時改變格子頁、今天頁與回顧頁，所以 revalidate 整個 layout 底下。
    revalidatePath(str(form, "planId") ? `/plans/${str(form, "planId")}` : "/", "layout");
    return {};
  });
}

export async function renamePlanTitle(_prev: Result, form: FormData): Promise<Result> {
  const parsed = planRenameInput.safeParse({ planId: str(form, "planId"), title: str(form, "title") });
  if (!parsed.success) return fail(parsed.error);

  return withUser(async (userId) => {
    await renamePlan(userId, parsed.data.planId, parsed.data.title);
    revalidatePath(`/plans/${parsed.data.planId}`, "layout");
    revalidatePath("/");
    return {};
  });
}

/** 刪掉整份計劃表，連同底下的次目標、行為、紀錄（FK cascade）。不可復原。 */
export async function removePlan(_prev: Result, form: FormData): Promise<Result> {
  const parsed = planIdInput.safeParse({ planId: str(form, "planId") });
  if (!parsed.success) return fail(parsed.error);

  return withUser(async (userId) => {
    await deletePlan(userId, parsed.data.planId);
    revalidatePath("/");
    redirect("/");
  });
}

/**
 * 移除一個次目標或一項行為。打過卡的封存、沒打過的直接刪，
 * 判斷在 db/writes.ts，見 docs/decisions/0009-soft-delete.md。
 */
export async function removeSubGoalCell(_prev: Result, form: FormData): Promise<Result> {
  const parsed = removeInput.safeParse({ id: str(form, "id"), planId: str(form, "planId") });
  if (!parsed.success) return fail(parsed.error);

  return withUser(async (userId) => {
    await removeSubGoal(userId, parsed.data.id);
    revalidatePath(`/plans/${parsed.data.planId}`, "layout");
    return {};
  });
}

export async function removeActionCell(_prev: Result, form: FormData): Promise<Result> {
  const parsed = removeInput.safeParse({ id: str(form, "id"), planId: str(form, "planId") });
  if (!parsed.success) return fail(parsed.error);

  return withUser(async (userId) => {
    await removeAction(userId, parsed.data.id);
    revalidatePath(`/plans/${parsed.data.planId}`, "layout");
    return {};
  });
}

/**
 * 一次採用多則 AI 建議的次目標。
 *
 * **空位是在寫入的當下重新確認的，不是相信生成當時的快照。** 使用者可能在看建議的
 * 時候自己先填了某一格；照舊快照寫下去就會蓋掉他剛打的字。已經有人的位置直接跳過，
 * 不報錯——他要的東西已經在那裡了。
 *
 * 走的是跟手動存檔同一支 upsertSubGoal 與同一份 Zod schema。建議不該有捷徑。
 */
export async function acceptSubGoals(
  planId: string,
  items: { position: number; title: string }[],
): Promise<Result> {
  return withUser(async (userId) => {
    const data = await loadPlan(userId, planId);
    if (!data) return { error: "找不到，或不屬於你" };

    const taken = new Set(data.subGoals.map((s) => s.position));
    const fresh = items.filter((i) => !taken.has(i.position));
    if (fresh.length === 0) return { error: "這些位置都已經有內容了。" };

    for (const item of fresh) {
      const parsed = subGoalInput.safeParse({ planId, position: item.position, title: item.title });
      if (!parsed.success) return fail(parsed.error);
      await upsertSubGoal(userId, parsed.data);
    }
    revalidatePath(`/plans/${planId}`, "layout");
    return {};
  });
}

/**
 * 一次採用多則 AI 建議的行為。與 acceptSubGoals 同一套規則：
 * **空位在寫入的當下重新確認**，已經有人的位置直接跳過，
 * 走的是跟手動存檔同一支 upsertAction 與同一份 actionInput。
 */
export async function acceptActions(
  planId: string,
  subGoalId: string,
  items: { position: number; title: string; trackingType: string; cadence: string | null; target: number | null }[],
): Promise<Result> {
  return withUser(async (userId) => {
    const data = await loadPlan(userId, planId);
    if (!data) return { error: "找不到，或不屬於你" };
    // subGoalId 來自表單，要確認它真的屬於這份計劃表——loadPlan 已經濾過主人了。
    if (!data.subGoals.some((s) => s.id === subGoalId)) return { error: "找不到，或不屬於你" };

    const taken = new Set(data.actions.filter((a) => a.subGoalId === subGoalId).map((a) => a.position));
    const fresh = items.filter((i) => !taken.has(i.position));
    if (fresh.length === 0) return { error: "這些位置都已經有內容了。" };

    for (const item of fresh) {
      // cadence 與 target 只對特定型態有意義，其餘一律丟掉——
      // 跟 saveAction 同樣的處理，不要把使用者看不懂的 Zod 錯誤丟回去。
      const parsed = actionInput.safeParse({
        subGoalId,
        position: item.position,
        title: item.title,
        trackingType: item.trackingType,
        ...(item.trackingType === "habit" ? { cadence: item.cadence ?? "daily" } : {}),
        ...(item.trackingType === "quota" && item.target !== null ? { target: item.target } : {}),
      });
      if (!parsed.success) return fail(parsed.error);
      await upsertAction(userId, parsed.data);
    }
    revalidatePath(`/plans/${planId}`, "layout");
    return {};
  });
}
