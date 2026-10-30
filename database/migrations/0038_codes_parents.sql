CREATE TABLE "parent_codes" (
	"learner_user_id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "parent_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "parent_codes" ADD CONSTRAINT "parent_codes_learner_user_id_users_id_fk" FOREIGN KEY ("learner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_codes" ADD CONSTRAINT "parent_codes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;