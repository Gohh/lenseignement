CREATE TABLE "exercise_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storage_key" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exercise_media_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"competency_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"difficulty" text NOT NULL,
	"skill" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"content" jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"review_note" text,
	"author_id" uuid,
	"reviewed_by" uuid,
	"replaces_id" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exercises_status_check" CHECK ("exercises"."status" in ('draft','review','published','archived')),
	CONSTRAINT "exercises_difficulty_check" CHECK ("exercises"."difficulty" in ('facile','moyen','difficile')),
	CONSTRAINT "exercises_skill_check" CHECK ("exercises"."skill" in ('connaitre','appliquer','raisonner'))
);
--> statement-breakpoint
ALTER TABLE "exercise_media" ADD CONSTRAINT "exercise_media_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_media" ADD CONSTRAINT "exercise_media_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_competency_id_competencies_id_fk" FOREIGN KEY ("competency_id") REFERENCES "public"."competencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_replaces_id_exercises_id_fk" FOREIGN KEY ("replaces_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exercises_organization_idx" ON "exercises" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "exercises_published_idx" ON "exercises" USING btree ("status","domain");--> statement-breakpoint
-- Un exercice publié ne change plus : seuls son état (retiré, remis en ligne) et la date de mise à
-- jour bougent. Pour le corriger, on publie un nouveau brouillon qui le remplace.
CREATE FUNCTION exercises_frozen() RETURNS trigger AS $$
BEGIN
  IF OLD.status IN ('published', 'archived') AND OLD.published_at IS NOT NULL AND (
    NEW.content IS DISTINCT FROM OLD.content OR NEW.title IS DISTINCT FROM OLD.title
    OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.competency_id IS DISTINCT FROM OLD.competency_id
    OR NEW.domain IS DISTINCT FROM OLD.domain OR NEW.difficulty IS DISTINCT FROM OLD.difficulty
    OR NEW.skill IS DISTINCT FROM OLD.skill OR NEW.status NOT IN ('published', 'archived')
  ) THEN
    RAISE EXCEPTION 'exercice publié : contenu figé';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER exercises_frozen BEFORE UPDATE ON exercises
  FOR EACH ROW EXECUTE FUNCTION exercises_frozen();
