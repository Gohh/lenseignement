ALTER TABLE "cohorts" ADD COLUMN "level" text;--> statement-breakpoint
ALTER TABLE "cohorts" ADD COLUMN "join_code" text;--> statement-breakpoint
ALTER TABLE "cohorts" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cohorts" ADD CONSTRAINT "cohorts_join_code_unique" UNIQUE("join_code");