CREATE TABLE "diagnostic_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"diagnostic_id" uuid NOT NULL,
	"competency_id" uuid NOT NULL,
	"phase" text NOT NULL,
	"position" integer NOT NULL,
	"prompt" text NOT NULL,
	"choices" jsonb NOT NULL,
	"correct_choice" integer NOT NULL,
	"explanation" text DEFAULT '' NOT NULL,
	CONSTRAINT "diagnostic_items_position_unique" UNIQUE("diagnostic_id","phase","position"),
	CONSTRAINT "diagnostic_items_phase_check" CHECK ("diagnostic_items"."phase" in ('diagnostic','post_test')),
	CONSTRAINT "diagnostic_items_choices_check" CHECK (jsonb_typeof("diagnostic_items"."choices") = 'array' and jsonb_array_length("diagnostic_items"."choices") between 2 and 4),
	CONSTRAINT "diagnostic_items_correct_check" CHECK ("diagnostic_items"."correct_choice" >= 0 and "diagnostic_items"."correct_choice" < jsonb_array_length("diagnostic_items"."choices"))
);
--> statement-breakpoint
CREATE TABLE "diagnostic_responses" (
	"session_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"choice" integer NOT NULL,
	"correct" boolean NOT NULL,
	CONSTRAINT "diagnostic_responses_session_id_item_id_pk" PRIMARY KEY("session_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "diagnostic_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"diagnostic_id" uuid NOT NULL,
	"phase" text NOT NULL,
	"plan_id" uuid,
	"score" integer NOT NULL,
	"total" integer NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "diagnostic_sessions_phase_check" CHECK ("diagnostic_sessions"."phase" in ('diagnostic','post_test')),
	CONSTRAINT "diagnostic_sessions_plan_check" CHECK (("diagnostic_sessions"."phase" = 'post_test') = ("diagnostic_sessions"."plan_id" is not null)),
	CONSTRAINT "diagnostic_sessions_score_check" CHECK ("diagnostic_sessions"."score" >= 0 and "diagnostic_sessions"."score" <= "diagnostic_sessions"."total")
);
--> statement-breakpoint
CREATE TABLE "diagnostics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"curriculum_version_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "diagnostics_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "remediation_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"diagnostic_id" uuid NOT NULL,
	"diagnostic_session_id" uuid NOT NULL,
	"competency_id" uuid NOT NULL,
	"course_id" uuid,
	"rationale" jsonb NOT NULL,
	"source" text NOT NULL,
	"decided_by" uuid,
	"reason" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "remediation_plans_status_check" CHECK ("remediation_plans"."status" in ('active','completed','replaced')),
	CONSTRAINT "remediation_plans_source_check" CHECK ("remediation_plans"."source" in ('rule','teacher')),
	CONSTRAINT "remediation_plans_teacher_check" CHECK ("remediation_plans"."source" = 'rule' or ("remediation_plans"."decided_by" is not null and "remediation_plans"."reason" is not null))
);
--> statement-breakpoint
CREATE TABLE "skill_results" (
	"session_id" uuid NOT NULL,
	"competency_id" uuid NOT NULL,
	"correct" integer NOT NULL,
	"total" integer NOT NULL,
	"mastered" boolean NOT NULL,
	CONSTRAINT "skill_results_session_id_competency_id_pk" PRIMARY KEY("session_id","competency_id")
);
--> statement-breakpoint
ALTER TABLE "diagnostic_items" ADD CONSTRAINT "diagnostic_items_diagnostic_id_diagnostics_id_fk" FOREIGN KEY ("diagnostic_id") REFERENCES "public"."diagnostics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagnostic_items" ADD CONSTRAINT "diagnostic_items_competency_id_competencies_id_fk" FOREIGN KEY ("competency_id") REFERENCES "public"."competencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagnostic_responses" ADD CONSTRAINT "diagnostic_responses_session_id_diagnostic_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."diagnostic_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagnostic_responses" ADD CONSTRAINT "diagnostic_responses_item_id_diagnostic_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."diagnostic_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagnostic_sessions" ADD CONSTRAINT "diagnostic_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagnostic_sessions" ADD CONSTRAINT "diagnostic_sessions_diagnostic_id_diagnostics_id_fk" FOREIGN KEY ("diagnostic_id") REFERENCES "public"."diagnostics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagnostic_sessions" ADD CONSTRAINT "diagnostic_sessions_plan_id_remediation_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."remediation_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagnostics" ADD CONSTRAINT "diagnostics_curriculum_version_id_curriculum_versions_id_fk" FOREIGN KEY ("curriculum_version_id") REFERENCES "public"."curriculum_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remediation_plans" ADD CONSTRAINT "remediation_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remediation_plans" ADD CONSTRAINT "remediation_plans_diagnostic_id_diagnostics_id_fk" FOREIGN KEY ("diagnostic_id") REFERENCES "public"."diagnostics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remediation_plans" ADD CONSTRAINT "remediation_plans_diagnostic_session_id_diagnostic_sessions_id_fk" FOREIGN KEY ("diagnostic_session_id") REFERENCES "public"."diagnostic_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remediation_plans" ADD CONSTRAINT "remediation_plans_competency_id_competencies_id_fk" FOREIGN KEY ("competency_id") REFERENCES "public"."competencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remediation_plans" ADD CONSTRAINT "remediation_plans_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remediation_plans" ADD CONSTRAINT "remediation_plans_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_results" ADD CONSTRAINT "skill_results_session_id_diagnostic_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."diagnostic_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_results" ADD CONSTRAINT "skill_results_competency_id_competencies_id_fk" FOREIGN KEY ("competency_id") REFERENCES "public"."competencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "diagnostic_sessions_user_idx" ON "diagnostic_sessions" USING btree ("user_id","submitted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "remediation_plans_one_active" ON "remediation_plans" USING btree ("user_id") WHERE "remediation_plans"."status" = 'active';