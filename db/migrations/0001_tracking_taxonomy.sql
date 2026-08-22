ALTER TABLE "actions" ADD COLUMN "cadence" text;--> statement-breakpoint
-- 舊的三類搬到新的四類（見 docs/decisions/0008-tracking-taxonomy.md）：
--   daily   → habit + 每日
--   count   → quota
--   percent → milestone（原本手動拉的進度改成「完成／未完成」）
UPDATE "actions" SET "cadence" = 'daily' WHERE "tracking_type" = 'daily';--> statement-breakpoint
UPDATE "actions" SET "tracking_type" = 'habit' WHERE "tracking_type" = 'daily';--> statement-breakpoint
UPDATE "actions" SET "tracking_type" = 'quota' WHERE "tracking_type" = 'count';--> statement-breakpoint
UPDATE "actions" SET "tracking_type" = 'milestone' WHERE "tracking_type" = 'percent';
