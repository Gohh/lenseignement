CREATE TABLE "course_review_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_version_id" uuid NOT NULL,
	"action" text NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"comment" text DEFAULT '' NOT NULL,
	"checklist" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_review_events_action_check" CHECK ("course_review_events"."action" in ('submitted','changes_requested','approved','published','replaced','withdrawn'))
);
--> statement-breakpoint
DROP INDEX "course_versions_one_draft";--> statement-breakpoint
ALTER TABLE "course_versions" ADD COLUMN "submitted_by" uuid;--> statement-breakpoint
ALTER TABLE "course_versions" ADD COLUMN "approved_by" uuid;--> statement-breakpoint
ALTER TABLE "course_versions" ADD COLUMN "published_by" uuid;--> statement-breakpoint
ALTER TABLE "course_versions" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "course_review_events" ADD CONSTRAINT "course_review_events_course_version_id_course_versions_id_fk" FOREIGN KEY ("course_version_id") REFERENCES "public"."course_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_review_events" ADD CONSTRAINT "course_review_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "course_review_events_version_idx" ON "course_review_events" USING btree ("course_version_id");--> statement-breakpoint
ALTER TABLE "course_versions" ADD CONSTRAINT "course_versions_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_versions" ADD CONSTRAINT "course_versions_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_versions" ADD CONSTRAINT "course_versions_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "course_versions_one_open" ON "course_versions" USING btree ("course_id") WHERE "course_versions"."status" in ('draft','in_review','approved');--> statement-breakpoint
CREATE UNIQUE INDEX "course_versions_one_published" ON "course_versions" USING btree ("course_id") WHERE "course_versions"."status" = 'published';