CREATE TABLE "membership_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"role" text NOT NULL,
	"branches" text[],
	"created_by_user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_by_user_id" uuid,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_invitations_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "memberships" DROP CONSTRAINT "memberships_role_check";--> statement-breakpoint
ALTER TABLE "membership_invitations" ADD CONSTRAINT "membership_invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_invitations" ADD CONSTRAINT "membership_invitations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_invitations" ADD CONSTRAINT "membership_invitations_used_by_user_id_users_id_fk" FOREIGN KEY ("used_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "membership_invitations_org_idx" ON "membership_invitations" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_role_check" CHECK ("memberships"."role" in ('chef-etablissement','enseignant','apprenant','alphabetiseur','referent-pedagogique','gestionnaire','administrateur','superadministrateur'));