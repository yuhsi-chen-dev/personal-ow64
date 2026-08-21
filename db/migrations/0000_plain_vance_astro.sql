CREATE TABLE "actions" (
	"id" text PRIMARY KEY NOT NULL,
	"sub_goal_id" text NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"tracking_type" text NOT NULL,
	"target" integer
);
--> statement-breakpoint
CREATE TABLE "logs" (
	"id" text PRIMARY KEY NOT NULL,
	"action_id" text NOT NULL,
	"day" date NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"value" real NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sub_goals" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_sub_goal_id_sub_goals_id_fk" FOREIGN KEY ("sub_goal_id") REFERENCES "public"."sub_goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logs" ADD CONSTRAINT "logs_action_id_actions_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."actions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_goals" ADD CONSTRAINT "sub_goals_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "actions_sub_goal_position_idx" ON "actions" USING btree ("sub_goal_id","position");--> statement-breakpoint
CREATE INDEX "logs_action_day_idx" ON "logs" USING btree ("action_id","day");--> statement-breakpoint
CREATE UNIQUE INDEX "sub_goals_plan_position_idx" ON "sub_goals" USING btree ("plan_id","position");