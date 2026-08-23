DROP INDEX "actions_sub_goal_position_idx";--> statement-breakpoint
DROP INDEX "sub_goals_plan_position_idx";--> statement-breakpoint
ALTER TABLE "actions" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sub_goals" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "actions_sub_goal_position_idx" ON "actions" USING btree ("sub_goal_id","position") WHERE archived_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "sub_goals_plan_position_idx" ON "sub_goals" USING btree ("plan_id","position") WHERE archived_at is null;