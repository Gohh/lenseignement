CREATE TABLE "exam_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_id" uuid NOT NULL,
	"title" text NOT NULL,
	"zone_id" uuid,
	"level" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exam_campaigns_dates_check" CHECK ("exam_campaigns"."ends_at" > "exam_campaigns"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "campaign_id" uuid;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "opens_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "results_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "exam_campaigns" ADD CONSTRAINT "exam_campaigns_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_campaigns" ADD CONSTRAINT "exam_campaigns_zone_id_organizations_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_campaigns" ADD CONSTRAINT "exam_campaigns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exam_campaigns_exam_idx" ON "exam_campaigns" USING btree ("exam_id");--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_campaign_id_exam_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."exam_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assignments_campaign_idx" ON "assignments" USING btree ("campaign_id");