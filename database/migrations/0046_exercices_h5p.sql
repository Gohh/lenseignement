CREATE TABLE "h5p_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storage_key" text NOT NULL,
	"title" text NOT NULL,
	"main_library" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"uploaded_by" uuid,
	"size_bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "h5p_packages_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
ALTER TABLE "h5p_packages" ADD CONSTRAINT "h5p_packages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "h5p_packages" ADD CONSTRAINT "h5p_packages_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;