// 跨信任邊界的輸入驗證。規格見 docs/decisions/0006-input-validation-zod.md。
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

/** target 的必填與否取決於 trackingType，所以用 discriminated union 表達，不要拆成兩次驗證。 */
export const actionInput = z.intersection(
  z.object({ subGoalId: z.string().min(1), position: slot, title }),
  z.discriminatedUnion("trackingType", [
    z.object({ trackingType: z.literal("daily"), target: z.null().default(null) }),
    z.object({
      trackingType: z.literal("count"),
      target: z
        .number({ error: "選「次數」時要填目標次數" })
        .int("目標次數要是整數")
        .positive("目標次數要大於 0"),
    }),
    z.object({ trackingType: z.literal("percent"), target: z.null().default(null) }),
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
    trackingType: z.enum(["daily", "count", "percent"]),
    day,
    value: z.number().finite(),
  })
  .superRefine((v, ctx) => {
    const bad = (message: string) => ctx.addIssue({ code: "custom", path: ["value"], message });
    if (v.trackingType === "daily" && v.value !== 1) bad("daily 的 value 恆為 1");
    if (v.trackingType === "count" && v.value <= 0) bad("count 的 value 要是正數");
    if (v.trackingType === "percent" && (v.value < 0 || v.value > 100)) bad("percent 的 value 要在 0..100");
  });

export type PlanInput = z.infer<typeof planInput>;
export type SubGoalInput = z.infer<typeof subGoalInput>;
export type ActionInput = z.infer<typeof actionInput>;
export type LogInput = z.infer<typeof logInput>;
