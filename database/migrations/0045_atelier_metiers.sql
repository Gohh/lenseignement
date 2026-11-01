CREATE TABLE "workshops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"trade" text NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"competency_id" uuid,
	"practice" boolean DEFAULT true NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"review_note" text,
	"author_id" uuid,
	"reviewed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workshops_status_check" CHECK ("workshops"."status" in ('draft','review','published','archived'))
);
--> statement-breakpoint
ALTER TABLE "safety_simulations" ALTER COLUMN "curriculum_version_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "safety_simulations" ALTER COLUMN "competency_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "safety_simulations" ALTER COLUMN "practice_competency_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "safety_simulations" ADD COLUMN "workshop_id" uuid;--> statement-breakpoint
ALTER TABLE "safety_simulations" ADD COLUMN "trade" text;--> statement-breakpoint
ALTER TABLE "safety_simulations" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "safety_simulations" ADD COLUMN "practice" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "workshops" ADD CONSTRAINT "workshops_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshops" ADD CONSTRAINT "workshops_competency_id_competencies_id_fk" FOREIGN KEY ("competency_id") REFERENCES "public"."competencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshops" ADD CONSTRAINT "workshops_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshops" ADD CONSTRAINT "workshops_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workshops_organization_idx" ON "workshops" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "safety_simulations" ADD CONSTRAINT "safety_simulations_workshop_id_workshops_id_fk" FOREIGN KEY ("workshop_id") REFERENCES "public"."workshops"("id") ON DELETE no action ON UPDATE no action;