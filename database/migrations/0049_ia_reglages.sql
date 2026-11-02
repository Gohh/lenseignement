CREATE TABLE "ai_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"provider" text DEFAULT 'mistral' NOT NULL,
	"model" text DEFAULT '' NOT NULL,
	"base_url" text DEFAULT '' NOT NULL,
	"api_key_cipher" text,
	"key_hint" text,
	"daily_limit" integer DEFAULT 30 NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_settings_single_row" CHECK ("ai_settings"."id" = 1),
	CONSTRAINT "ai_settings_provider_check" CHECK ("ai_settings"."provider" in ('mistral','anthropic','openai','local'))
);
--> statement-breakpoint
ALTER TABLE "ai_settings" ADD CONSTRAINT "ai_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;