ALTER TABLE "membership_invitations" ALTER COLUMN "created_by_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_changes" ALTER COLUMN "changed_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "parent_codes" ALTER COLUMN "created_by_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tutor_links" ALTER COLUMN "granted_by_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "withdrawn_rights" ALTER COLUMN "withdrawn_by" DROP NOT NULL;