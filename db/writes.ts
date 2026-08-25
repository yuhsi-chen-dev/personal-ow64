// 純資料操作，不碰 Next 的東西（revalidatePath / redirect）。
// 抽出來是為了能在 Next 請求脈絡外被整合測試呼叫，見 db/write-path.test.ts。
//
// **每一支都吃 userId，而且 userId 一定要進到 WHERE 或先過守衛。**
// 這不是防守性程式碼，是這個 app 的鐵則：只在讀取端過濾擋不住「直接 POST 別人的 id」。
// 見 docs/decisions/0011-multi-tenant.md 與 CLAUDE.md 的限制。
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "./index.ts";
import { actions, logs, plans, subGoals } from "./schema.ts";
import { periodKey, type Cadence } from "../lib/day.ts";
import type { ActionInput, LogInput, SubGoalInput } from "../lib/schemas.ts";

/**
 * 這個 id 不存在，或者不屬於你。
 *
 * **兩種情況刻意共用同一個錯誤與同一句話。** 分開講的話，「不屬於你」就成了
 * 「這個 id 存在」的探測器，可以拿來把別人的 id 掃出來。
 */
export class NotYours extends Error {
  constructor() {
    super("找不到，或不屬於你");
    this.name = "NotYours";
  }
}

/* ---------- 擁有權守衛 ---------- */

/*
 * 守衛與後續的寫入是兩句 SQL，中間理論上有 TOCTOU 的空隙。現在不可利用，
 * 因為**沒有任何功能會改變一份計劃表的主人**——userId 從建立那一刻就固定了。
 * 哪天做了「轉讓計劃表」或「刪帳號時把資料轉給別人」，這個假設就破了，
 * 屆時要把守衛與寫入併成單句（把 userId 條件寫進 UPDATE／DELETE 的 WHERE 子查詢）。
 */

async function assertOwnsPlan(userId: string, planId: string): Promise<void> {
  const [row] = await getDb()
    .select({ id: plans.id })
    .from(plans)
    .where(and(eq(plans.id, planId), eq(plans.userId, userId)));
  if (!row) throw new NotYours();
}

/** 次目標 → 計劃表 → 主人。 */
async function assertOwnsSubGoal(userId: string, subGoalId: string): Promise<void> {
  const [row] = await getDb()
    .select({ id: subGoals.id })
    .from(subGoals)
    .innerJoin(plans, eq(plans.id, subGoals.planId))
    .where(and(eq(subGoals.id, subGoalId), eq(plans.userId, userId)));
  if (!row) throw new NotYours();
}

/** 行為 → 次目標 → 計劃表 → 主人。要 join 兩層才知道一格是誰的。 */
async function assertOwnsAction(userId: string, actionId: string): Promise<void> {
  const [row] = await getDb()
    .select({ id: actions.id })
    .from(actions)
    .innerJoin(subGoals, eq(subGoals.id, actions.subGoalId))
    .innerJoin(plans, eq(plans.id, subGoals.planId))
    .where(and(eq(actions.id, actionId), eq(plans.userId, userId)));
  if (!row) throw new NotYours();
}

/* ---------- 寫入 ---------- */

export async function insertPlan(userId: string, title: string): Promise<string> {
  const id = crypto.randomUUID();
  await getDb().insert(plans).values({ id, userId, title });
  return id;
}

export async function upsertSubGoal(userId: string, { planId, position, title }: SubGoalInput) {
  await assertOwnsPlan(userId, planId);
  await getDb()
    .insert(subGoals)
    .values({ id: crypto.randomUUID(), planId, position, title })
    .onConflictDoUpdate({
      target: [subGoals.planId, subGoals.position],
      targetWhere: isNull(subGoals.archivedAt), // 索引是條件式的，這裡要一模一樣才對得上
      set: { title },
    });
}

export async function upsertAction(
  userId: string,
  { subGoalId, position, title, trackingType, cadence, timesPerPeriod, target }: ActionInput,
) {
  await assertOwnsSubGoal(userId, subGoalId);
  await getDb()
    .insert(actions)
    .values({ id: crypto.randomUUID(), subGoalId, position, title, trackingType, cadence, timesPerPeriod, target })
    .onConflictDoUpdate({
      target: [actions.subGoalId, actions.position],
      targetWhere: isNull(actions.archivedAt),
      set: { title, trackingType, cadence, timesPerPeriod, target },
    });
}

/** 找一項還沒封存、而且屬於這個使用者的行為。不是他的就當作不存在。 */
export async function findAction(userId: string, id: string) {
  const [row] = await getDb()
    .select({
      id: actions.id,
      trackingType: actions.trackingType,
      cadence: actions.cadence,
      timesPerPeriod: actions.timesPerPeriod,
      target: actions.target,
    })
    .from(actions)
    .innerJoin(subGoals, eq(subGoals.id, actions.subGoalId))
    .innerJoin(plans, eq(plans.id, subGoals.planId))
    .where(and(eq(actions.id, id), isNull(actions.archivedAt), eq(plans.userId, userId)));
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
export async function logOnce(
  userId: string,
  { actionId, trackingType, cadence, timesPerPeriod, day, value }: LogInput & {
    cadence: Cadence | null;
    timesPerPeriod: number | null;
  },
): Promise<boolean> {
  await assertOwnsAction(userId, actionId);
  if (trackingType === "mantra") return false;

  if (trackingType === "habit" || trackingType === "milestone") {
    const existing = await getDb().select({ day: logs.day }).from(logs).where(eq(logs.actionId, actionId));
    // 習慣型的上限是「一期 timesPerPeriod 次」，不是「一期一次」——
    // 每週跑 3 次的人第二次按下去必須記得進來。
    const key = periodKey(day, cadence ?? "daily");
    const already =
      trackingType === "milestone"
        ? existing.length > 0
        : existing.filter((l) => periodKey(l.day, cadence ?? "daily") === key).length >= Math.max(1, timesPerPeriod ?? 1);
    if (already) return false;
  }

  await getDb().insert(logs).values({ id: crypto.randomUUID(), actionId, day, value });
  return true;
}

/**
 * 撤銷某一天的最後一筆紀錄。回傳有沒有真的刪掉。
 *
 * **只動 `day` 當天的最後一筆，不是「這一期」的最後一筆。** 誤觸就是當下發生的事，
 * 範圍收在今天，撤銷鍵才不會在使用者沒看見的地方刪掉三天前的紀錄——
 * 歷史紀錄不能被遺失或覆蓋是這個 app 的第一優先序（見 CLAUDE.md）。
 *
 * 按 occurredAt 由新到舊取一筆，不是整天全刪：一天記三次的人只想收回剛剛那一次。
 */
export async function undoLog(userId: string, actionId: string, day: string): Promise<boolean> {
  await assertOwnsAction(userId, actionId);
  const [last] = await getDb()
    .select({ id: logs.id })
    .from(logs)
    .where(and(eq(logs.actionId, actionId), eq(logs.day, day)))
    .orderBy(desc(logs.occurredAt))
    .limit(1);
  if (!last) return false;
  await getDb().delete(logs).where(eq(logs.id, last.id));
  return true;
}

/** 連同底下的次目標、行為、紀錄一起刪（靠 FK cascade）。userId 直接進 WHERE。 */
export async function deletePlan(userId: string, planId: string) {
  await getDb().delete(plans).where(and(eq(plans.id, planId), eq(plans.userId, userId)));
}

export async function renamePlan(userId: string, planId: string, title: string) {
  await getDb()
    .update(plans)
    .set({ title })
    .where(and(eq(plans.id, planId), eq(plans.userId, userId)));
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
export async function removeAction(userId: string, id: string): Promise<"deleted" | "archived"> {
  await assertOwnsAction(userId, id);
  if (await hasLogs([id])) {
    await getDb().update(actions).set({ archivedAt: new Date() }).where(eq(actions.id, id));
    return "archived";
  }
  await getDb().delete(actions).where(eq(actions.id, id));
  return "deleted";
}

/** 移除一個次目標，連同底下 8 項行為。判準與 removeAction 相同：有紀錄就封存。 */
export async function removeSubGoal(userId: string, id: string): Promise<"deleted" | "archived"> {
  await assertOwnsSubGoal(userId, id);
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
