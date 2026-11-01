CREATE TABLE "library_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_id" uuid NOT NULL,
	"role" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"original_name" text,
	"storage_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "library_files_role_check" CHECK ("library_files"."role" in ('content', 'cover'))
);
--> statement-breakpoint
ALTER TABLE "class_resources" ALTER COLUMN "url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "class_resources" ADD COLUMN "format" text DEFAULT 'lien' NOT NULL;--> statement-breakpoint
ALTER TABLE "class_resources" ADD COLUMN "shelf" text DEFAULT 'Autres' NOT NULL;--> statement-breakpoint
ALTER TABLE "class_resources" ADD COLUMN "author" text;--> statement-breakpoint
ALTER TABLE "class_resources" ADD COLUMN "cover_color" text DEFAULT '#146b46' NOT NULL;--> statement-breakpoint
ALTER TABLE "class_resources" ADD COLUMN "offline_allowed" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "library_files" ADD CONSTRAINT "library_files_resource_id_class_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."class_resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "library_files_resource_idx" ON "library_files" USING btree ("resource_id","role","position");--> statement-breakpoint
ALTER TABLE "class_resources" ADD CONSTRAINT "class_resources_format_check" CHECK ("class_resources"."format" in ('lien', 'pdf', 'epub', 'images', 'audio', 'video'));