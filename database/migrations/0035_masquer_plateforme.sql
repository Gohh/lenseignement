ALTER TABLE "organizations" ADD COLUMN "internal" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- La structure « Plateforme » créée par la commande superadmin devient technique (jamais listée).
UPDATE "organizations" SET "internal" = true WHERE "name" = 'Plateforme' AND "type" = 'authority' AND "parent_id" IS NULL;
