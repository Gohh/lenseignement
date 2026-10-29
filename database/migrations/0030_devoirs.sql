CREATE TABLE "assignment_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"learner_user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"score" integer,
	"comment" text,
	"graded_by_user_id" uuid,
	"graded_at" timestamp with time zone,
	CONSTRAINT "assignment_submissions_once" UNIQUE("assignment_id","learner_user_id")
);
--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cohort_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"instructions" text NOT NULL,
	"due_at" timestamp with time zone,
	"max_score" integer DEFAULT 20 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assignments_max_score_check" CHECK ("assignments"."max_score" between 1 and 100)
);
--> statement-breakpoint
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_learner_user_id_users_id_fk" FOREIGN KEY ("learner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_graded_by_user_id_users_id_fk" FOREIGN KEY ("graded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assignments_cohort_idx" ON "assignments" USING btree ("cohort_id");