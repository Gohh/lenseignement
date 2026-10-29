CREATE TABLE "help_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"learner_user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"body" text NOT NULL,
	"course_id" uuid,
	"lesson_number" integer,
	"answer" text,
	"answered_by_user_id" uuid,
	"answered_at" timestamp with time zone,
	"learner_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "help_questions_kind_check" CHECK ("help_questions"."kind" in ('not_understood','stuck','other'))
);
--> statement-breakpoint
ALTER TABLE "help_questions" ADD CONSTRAINT "help_questions_learner_user_id_users_id_fk" FOREIGN KEY ("learner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "help_questions" ADD CONSTRAINT "help_questions_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "help_questions" ADD CONSTRAINT "help_questions_answered_by_user_id_users_id_fk" FOREIGN KEY ("answered_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "help_questions_learner_idx" ON "help_questions" USING btree ("learner_user_id");