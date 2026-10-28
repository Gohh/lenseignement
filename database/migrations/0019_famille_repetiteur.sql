CREATE TABLE "tutor_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"guardian_user_id" uuid NOT NULL,
	"learner_user_ids" uuid[] NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_by_user_id" uuid,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tutor_invitations_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "tutor_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tutor_user_id" uuid NOT NULL,
	"learner_user_id" uuid NOT NULL,
	"granted_by_user_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tutor_links_pair_unique" UNIQUE("tutor_user_id","learner_user_id"),
	CONSTRAINT "tutor_links_status_check" CHECK ("tutor_links"."status" in ('active','revoked')),
	CONSTRAINT "tutor_links_not_self" CHECK ("tutor_links"."tutor_user_id" <> "tutor_links"."learner_user_id")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "level" text;--> statement-breakpoint
ALTER TABLE "tutor_invitations" ADD CONSTRAINT "tutor_invitations_guardian_user_id_users_id_fk" FOREIGN KEY ("guardian_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_invitations" ADD CONSTRAINT "tutor_invitations_used_by_user_id_users_id_fk" FOREIGN KEY ("used_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_links" ADD CONSTRAINT "tutor_links_tutor_user_id_users_id_fk" FOREIGN KEY ("tutor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_links" ADD CONSTRAINT "tutor_links_learner_user_id_users_id_fk" FOREIGN KEY ("learner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_links" ADD CONSTRAINT "tutor_links_granted_by_user_id_users_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tutor_invitations_guardian_idx" ON "tutor_invitations" USING btree ("guardian_user_id");--> statement-breakpoint
CREATE INDEX "tutor_links_learner_idx" ON "tutor_links" USING btree ("learner_user_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_level_check" CHECK ("users"."level" is null or "users"."level" in ('mat-1','mat-2','mat-3','cp1','cp2','ce1','ce2','cm1','cm2','6e','5e','4e','3e','2nde','1re','tle','alpha-1','alpha-2','alpha-3'));