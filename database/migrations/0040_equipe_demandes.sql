CREATE TABLE "team_join_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invitation_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"levels" text[] NOT NULL,
	"subjects" text[] NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_by_user_id" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "membership_invitations" ADD COLUMN "uses" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "membership_invitations" ADD COLUMN "max_uses" integer;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "levels" text[];--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "subjects" text[];--> statement-breakpoint
ALTER TABLE "team_join_requests" ADD CONSTRAINT "team_join_requests_invitation_id_membership_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."membership_invitations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_join_requests" ADD CONSTRAINT "team_join_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_join_requests" ADD CONSTRAINT "team_join_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_join_requests" ADD CONSTRAINT "team_join_requests_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_join_requests_org_idx" ON "team_join_requests" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "team_join_requests_user_idx" ON "team_join_requests" USING btree ("user_id");--> statement-breakpoint
-- Les invitations déjà créées gardent leur règle : une seule personne.
UPDATE "membership_invitations" SET "max_uses" = 1, "uses" = CASE WHEN "used_at" IS NULL THEN 0 ELSE 1 END;
