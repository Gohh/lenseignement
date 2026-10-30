CREATE TABLE "withdrawn_rights" (
	"role" text NOT NULL,
	"right" text NOT NULL,
	"withdrawn_by" uuid NOT NULL,
	"withdrawn_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "withdrawn_rights_role_right_pk" PRIMARY KEY("role","right")
);
--> statement-breakpoint
ALTER TABLE "withdrawn_rights" ADD CONSTRAINT "withdrawn_rights_withdrawn_by_users_id_fk" FOREIGN KEY ("withdrawn_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;