import { pgTable, text, integer, real, timestamp, date, index, uniqueIndex } from "drizzle-orm/pg-core";

// 一份計劃表。title 即核心目標。
export const plans = pgTable("plans", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 次目標，position 0..7 對應 lib/mandala.ts 的 slot 序號。
// 計劃表允許未填滿，所以沒填的 slot 就是沒有這一列。
export const subGoals = pgTable(
  "sub_goals",
  {
    id: text("id").primaryKey(),
    planId: text("plan_id").notNull().references(() => plans.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    title: text("title").notNull(),
  },
  // 一個 slot 只能有一個次目標；upsert 靠這個約束。
  (t) => [uniqueIndex("sub_goals_plan_position_idx").on(t.planId, t.position)],
);

// 具體行為，唯一可被追蹤的單位，一份計劃表最多 64 列。
export const actions = pgTable(
  "actions",
  {
    id: text("id").primaryKey(),
    subGoalId: text("sub_goal_id").notNull().references(() => subGoals.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    title: text("title").notNull(),
    // 四類的語意見 docs/decisions/0008-tracking-taxonomy.md
    trackingType: text("tracking_type", { enum: ["habit", "quota", "milestone", "mantra"] }).notNull(),
    cadence: text("cadence", { enum: ["daily", "weekly", "monthly"] }), // 僅 habit 型使用
    target: integer("target"), // 僅 quota 型使用
  },
  (t) => [uniqueIndex("actions_sub_goal_position_idx").on(t.subGoalId, t.position)],
);

// 執行紀錄。三種 trackingType 共用這一張表，語意差異見 lib/progress.ts。
export const logs = pgTable(
  "logs",
  {
    id: text("id").primaryKey(),
    actionId: text("action_id").notNull().references(() => actions.id, { onDelete: "cascade" }),
    // 使用者當地的日曆日。不能由 occurredAt 推導——那是 UTC 時間點，
    // 換算成「哪一天」需要使用者時區，所以這裡獨立存一欄。daily 的冪等鍵。
    day: date("day", { mode: "string" }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    value: real("value").notNull(),
  },
  (t) => [index("logs_action_day_idx").on(t.actionId, t.day)],
);
