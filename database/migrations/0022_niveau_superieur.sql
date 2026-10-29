CREATE TABLE "level_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"learner_user_id" uuid NOT NULL,
	"from_level" text NOT NULL,
	"to_level" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_by_user_id" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "level_requests_status_check" CHECK ("level_requests"."status" in ('pending','approved','declined'))
);
--> statement-breakpoint
ALTER TABLE "level_requests" ADD CONSTRAINT "level_requests_learner_user_id_users_id_fk" FOREIGN KEY ("learner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level_requests" ADD CONSTRAINT "level_requests_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "level_requests_learner_idx" ON "level_requests" USING btree ("learner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "level_requests_one_pending" ON "level_requests" USING btree ("learner_user_id") WHERE "level_requests"."status" = 'pending';