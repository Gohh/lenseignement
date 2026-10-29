-- La direction régionale devient une vraie structure (type « authority ») : chaque texte de région
-- déjà saisi sur un établissement sans parent crée la DRENA de ce nom, puis lui rattache l'établissement.
INSERT INTO "organizations" ("name", "type")
SELECT DISTINCT o."region", 'authority'
  FROM "organizations" o
 WHERE o."region" IS NOT NULL AND o."parent_id" IS NULL AND o."type" <> 'authority'
   AND NOT EXISTS (
     SELECT 1 FROM "organizations" a
      WHERE a."type" = 'authority' AND a."parent_id" IS NULL AND lower(a."name") = lower(o."region"));--> statement-breakpoint
UPDATE "organizations" o
   SET "parent_id" = a."id"
  FROM "organizations" a
 WHERE o."region" IS NOT NULL AND o."parent_id" IS NULL AND o."type" <> 'authority'
   AND a."type" = 'authority' AND a."parent_id" IS NULL AND lower(a."name") = lower(o."region");--> statement-breakpoint
ALTER TABLE "organizations" DROP COLUMN "region";
