ALTER TABLE "organizations" DROP CONSTRAINT "organizations_type_check";--> statement-breakpoint
UPDATE "organizations" SET "type" = 'primary_public' WHERE "type" = 'school';--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "region" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "locality" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "manager_name" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "manager_contact" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_type_check" CHECK ("organizations"."type" in ('primary_public','primary_private','college','lycee','secondary_private','technical_center','literacy_center','authority','partner'));