CREATE TABLE "organization_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"field" text NOT NULL,
	"old_value" text DEFAULT '' NOT NULL,
	"new_value" text DEFAULT '' NOT NULL,
	"effective_on" date NOT NULL,
	"note" text,
	"changed_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" DROP CONSTRAINT "organizations_type_check";--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "status" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "official_code" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "municipality" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "opened_year" integer;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "details" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_changes" ADD CONSTRAINT "organization_changes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_changes" ADD CONSTRAINT "organization_changes_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Anciens types vers les six catégories ; « public » / « privé » devient le statut.
UPDATE "organizations" SET "status" = CASE "type"
  WHEN 'primary_private' THEN 'prive-laic'
  WHEN 'secondary_private' THEN 'prive-laic'
  ELSE 'public' END
 WHERE "type" NOT IN ('authority','partner');--> statement-breakpoint
UPDATE "organizations" SET "type" = 'primary' WHERE "type" IN ('primary_public','primary_private');--> statement-breakpoint
UPDATE "organizations" SET "type" = 'lycee' WHERE "type" = 'secondary_private';--> statement-breakpoint
-- L'ancien « contact » devient le téléphone (10 chiffres) ou l'e-mail ; la colonne reste, rien n'est perdu.
UPDATE "organizations" SET "phone" = regexp_replace(regexp_replace("manager_contact", '[\s.()/-]', '', 'g'), '^(\+225|00225)', '')
 WHERE "manager_contact" IS NOT NULL
   AND regexp_replace(regexp_replace("manager_contact", '[\s.()/-]', '', 'g'), '^(\+225|00225)', '') ~ '^[0-9]{10}$';--> statement-breakpoint
UPDATE "organizations" SET "email" = lower(trim("manager_contact"))
 WHERE "manager_contact" ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$';--> statement-breakpoint
CREATE INDEX "organization_changes_org_idx" ON "organization_changes" USING btree ("organization_id","effective_on");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_official_code_unique" ON "organizations" USING btree (lower("official_code")) WHERE "organizations"."official_code" is not null;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_type_check" CHECK ("organizations"."type" in ('preschool','primary','college','lycee','literacy_center','technical_center','authority','partner'));