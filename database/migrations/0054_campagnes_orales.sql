CREATE TABLE "oral_campaign_classes" (
	"campaign_id" uuid NOT NULL,
	"cohort_id" uuid NOT NULL,
	CONSTRAINT "oral_campaign_classes_campaign_id_cohort_id_pk" PRIMARY KEY("campaign_id","cohort_id")
);
--> statement-breakpoint
CREATE TABLE "oral_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"test_id" uuid NOT NULL,
	"title" text NOT NULL,
	"zone_id" uuid,
	"level" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oral_campaigns_dates_check" CHECK ("oral_campaigns"."ends_at" > "oral_campaigns"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "oral_results" ADD COLUMN "campaign_id" uuid;--> statement-breakpoint
ALTER TABLE "oral_campaign_classes" ADD CONSTRAINT "oral_campaign_classes_campaign_id_oral_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."oral_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oral_campaign_classes" ADD CONSTRAINT "oral_campaign_classes_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oral_campaigns" ADD CONSTRAINT "oral_campaigns_test_id_oral_tests_id_fk" FOREIGN KEY ("test_id") REFERENCES "public"."oral_tests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oral_campaigns" ADD CONSTRAINT "oral_campaigns_zone_id_organizations_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oral_campaigns" ADD CONSTRAINT "oral_campaigns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "oral_campaign_classes_cohort_idx" ON "oral_campaign_classes" USING btree ("cohort_id");--> statement-breakpoint
CREATE INDEX "oral_campaigns_test_idx" ON "oral_campaigns" USING btree ("test_id");--> statement-breakpoint
ALTER TABLE "oral_results" ADD CONSTRAINT "oral_results_campaign_id_oral_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."oral_campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "oral_results_campaign_idx" ON "oral_results" USING btree ("campaign_id");