// 跨信任邊界的輸入驗證。規格見 docs/decisions/0006-input-validation-zod.md，
// 四種 trackingType 的語意見 docs/decisions/0008-tracking-taxonomy.md。
// lib/ 內部函式假設輸入已驗證過，不要在每一層重複 parse。
import { z } from "zod";

const title = z.string().trim().min(1, "不能空白").max(200, "最多 200 字");
const slot = z.number().int().min(0).max(7);

export const planInput = z.object({ title });

export const subGoalInput = z.object({
  planId: z.string().min(1),
  position: slot,
  title,
});

/**
 * cadence 只有 habit 用得到、target 只有 quota 用得到，
 * 所以用 discriminated union 綁在 trackingType 上，不要拆成兩次獨立驗證。
 */
export const actionInput = z.intersection(
  z.object({ subGoalId: z.string().min(1), position: slot, title }),
  z.discriminatedUnion("trackingType", [
    z.object({
      trackingType: z.literal("habit"),
      cadence: z.enum(["daily", "weekly", "monthly"], { error: "習慣要選頻率" }),
      target: z.null().default(null),
    }),
    z.object({
      trackingType: z.literal("quota"),
      cadence: z.null().default(null),
      target: z.number({ error: "選「累計」時要填目標數量" }).int("目標數量要是整數").positive("目標數量要大於 0"),
    }),
    z.object({ trackingType: z.literal("milestone"), cadence: z.null().default(null), target: z.null().default(null) }),
    z.object({ trackingType: z.literal("mantra"), cadence: z.null().default(null), target: z.null().default(null) }),
  ]),
);

/** 'YYYY-MM-DD'，且必須是真實存在的日期（擋掉 2026-02-30）。 */
export const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "格式須為 YYYY-MM-DD").refine((s) => {
  const [y, m, d] = s.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}, "不是真實存在的日期");

/**
 * log.value 的合法範圍取決於該 action 的 trackingType，
 * 所以驗證時必須把 trackingType 一起帶進來，不能單獨驗 value。
 */
export const logInput = z
  .object({
    actionId: z.string().min(1),
    trackingType: z.enum(["habit", "quota", "milestone", "mantra"]),
    day,
    value: z.number().finite(),
  })
  .superRefine((v, ctx) => {
    const bad = (message: string, path: string[] = ["value"]) =>
      ctx.addIssue({ code: "custom", path, message });
    if (v.trackingType === "mantra") bad("信念型不需要打卡", ["trackingType"]);
    if (v.trackingType === "habit" && v.value !== 1) bad("習慣型一次就是一次，value 恆為 1");
    if (v.trackingType === "milestone" && v.value !== 1) bad("里程碑只有完成與否，value 恆為 1");
    if (v.trackingType === "quota" && v.value <= 0) bad("累計型的數量要大於 0");
  });

export type PlanInput = z.infer<typeof planInput>;
export type SubGoalInput = z.infer<typeof subGoalInput>;
export type ActionInput = z.infer<typeof actionInput>;
export type LogInput = z.infer<typeof logInput>;
