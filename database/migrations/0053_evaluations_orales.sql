CREATE TABLE "oral_benchmarks" (
	"level" text NOT NULL,
	"subject" text NOT NULL,
	"per_minute" integer NOT NULL,
	"questions" integer,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oral_benchmarks_level_subject_pk" PRIMARY KEY("level","subject")
);
--> statement-breakpoint
CREATE TABLE "oral_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"test_id" uuid NOT NULL,
	"cohort_id" uuid NOT NULL,
	"learner_id" uuid NOT NULL,
	"assessor_id" uuid,
	"operation_id" uuid NOT NULL,
	"taken_at" timestamp with time zone DEFAULT now() NOT NULL,
	"parts" jsonb NOT NULL,
	"scores" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oral_results_once" UNIQUE("test_id","learner_id")
);
--> statement-breakpoint
CREATE TABLE "oral_tests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"author_id" uuid,
	"title" text NOT NULL,
	"subject" text NOT NULL,
	"level" text NOT NULL,
	"parts" jsonb NOT NULL,
	"status" text DEFAULT 'brouillon' NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oral_tests_status_check" CHECK ("oral_tests"."status" in ('brouillon','publiee')),
	CONSTRAINT "oral_tests_subject_check" CHECK ("oral_tests"."subject" in ('lecture','maths'))
);
--> statement-breakpoint
ALTER TABLE "oral_benchmarks" ADD CONSTRAINT "oral_benchmarks_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oral_results" ADD CONSTRAINT "oral_results_test_id_oral_tests_id_fk" FOREIGN KEY ("test_id") REFERENCES "public"."oral_tests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oral_results" ADD CONSTRAINT "oral_results_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oral_results" ADD CONSTRAINT "oral_results_learner_id_users_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oral_results" ADD CONSTRAINT "oral_results_assessor_id_users_id_fk" FOREIGN KEY ("assessor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oral_tests" ADD CONSTRAINT "oral_tests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oral_tests" ADD CONSTRAINT "oral_tests_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "oral_results_operation_idx" ON "oral_results" USING btree ("operation_id");--> statement-breakpoint
CREATE INDEX "oral_results_cohort_idx" ON "oral_results" USING btree ("cohort_id");--> statement-breakpoint
CREATE INDEX "oral_tests_organization_idx" ON "oral_tests" USING btree ("organization_id");