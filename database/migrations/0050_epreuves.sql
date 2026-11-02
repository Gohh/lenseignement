CREATE TABLE "exam_items" (
	"exam_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "exam_items_exam_id_exercise_id_pk" PRIMARY KEY("exam_id","exercise_id")
);
--> statement-breakpoint
CREATE TABLE "exams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"author_id" uuid,
	"title" text NOT NULL,
	"model" text NOT NULL,
	"curriculum_version_id" uuid NOT NULL,
	"shares" jsonb NOT NULL,
	"question_count" integer NOT NULL,
	"duration_minutes" integer NOT NULL,
	"threshold" integer DEFAULT 50 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exams_question_count_check" CHECK ("exams"."question_count" between 4 and 40),
	CONSTRAINT "exams_duration_check" CHECK ("exams"."duration_minutes" between 5 and 240),
	CONSTRAINT "exams_threshold_check" CHECK ("exams"."threshold" between 1 and 100)
);
--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "exam_id" uuid;--> statement-breakpoint
ALTER TABLE "exam_items" ADD CONSTRAINT "exam_items_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_items" ADD CONSTRAINT "exam_items_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_curriculum_version_id_curriculum_versions_id_fk" FOREIGN KEY ("curriculum_version_id") REFERENCES "public"."curriculum_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exam_items_exercise_idx" ON "exam_items" USING btree ("exercise_id");--> statement-breakpoint
CREATE INDEX "exams_organization_idx" ON "exams" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assignments_exam_idx" ON "assignments" USING btree ("exam_id");