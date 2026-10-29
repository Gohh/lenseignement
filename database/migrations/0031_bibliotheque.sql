CREATE TABLE "class_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cohort_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"url" text NOT NULL,
	"kind" text DEFAULT 'lien' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_resources_kind_check" CHECK ("class_resources"."kind" in ('lien', 'document', 'video', 'exercice'))
);
--> statement-breakpoint
ALTER TABLE "class_resources" ADD CONSTRAINT "class_resources_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_resources" ADD CONSTRAINT "class_resources_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "class_resources_cohort_idx" ON "class_resources" USING btree ("cohort_id","created_at");