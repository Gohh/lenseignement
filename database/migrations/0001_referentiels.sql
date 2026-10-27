CREATE TABLE "competencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"level_id" uuid,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"position" integer NOT NULL,
	CONSTRAINT "competencies_version_code_unique" UNIQUE("version_id","code")
);
--> statement-breakpoint
CREATE TABLE "competency_edges" (
	"version_id" uuid NOT NULL,
	"prerequisite_id" uuid NOT NULL,
	"competency_id" uuid NOT NULL,
	CONSTRAINT "competency_edges_prerequisite_id_competency_id_pk" PRIMARY KEY("prerequisite_id","competency_id"),
	CONSTRAINT "competency_edges_not_self" CHECK ("competency_edges"."prerequisite_id" <> "competency_edges"."competency_id")
);
--> statement-breakpoint
CREATE TABLE "curricula" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"branch" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "curricula_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "curriculum_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"curriculum_id" uuid NOT NULL,
	"label" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"effective_from" date,
	"effective_to" date,
	"policy_source_id" uuid,
	"notes" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "curriculum_versions_label_unique" UNIQUE("curriculum_id","label"),
	CONSTRAINT "curriculum_versions_status_check" CHECK ("curriculum_versions"."status" in ('draft','published')),
	CONSTRAINT "curriculum_versions_published_dated" CHECK ("curriculum_versions"."status" = 'draft' or ("curriculum_versions"."effective_from" is not null and "curriculum_versions"."published_at" is not null)),
	CONSTRAINT "curriculum_versions_period_check" CHECK ("curriculum_versions"."effective_to" is null or "curriculum_versions"."effective_to" > "curriculum_versions"."effective_from")
);
--> statement-breakpoint
CREATE TABLE "levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "levels_version_code_unique" UNIQUE("version_id","code")
);
--> statement-breakpoint
CREATE TABLE "policy_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"issuer" text NOT NULL,
	"url" text,
	"published_on" date,
	"is_official" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "subjects_version_code_unique" UNIQUE("version_id","code")
);
--> statement-breakpoint
ALTER TABLE "competencies" ADD CONSTRAINT "competencies_version_id_curriculum_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."curriculum_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competencies" ADD CONSTRAINT "competencies_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competencies" ADD CONSTRAINT "competencies_level_id_levels_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."levels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competency_edges" ADD CONSTRAINT "competency_edges_version_id_curriculum_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."curriculum_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competency_edges" ADD CONSTRAINT "competency_edges_prerequisite_id_competencies_id_fk" FOREIGN KEY ("prerequisite_id") REFERENCES "public"."competencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competency_edges" ADD CONSTRAINT "competency_edges_competency_id_competencies_id_fk" FOREIGN KEY ("competency_id") REFERENCES "public"."competencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_versions" ADD CONSTRAINT "curriculum_versions_curriculum_id_curricula_id_fk" FOREIGN KEY ("curriculum_id") REFERENCES "public"."curricula"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_versions" ADD CONSTRAINT "curriculum_versions_policy_source_id_policy_sources_id_fk" FOREIGN KEY ("policy_source_id") REFERENCES "public"."policy_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "levels" ADD CONSTRAINT "levels_version_id_curriculum_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."curriculum_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_version_id_curriculum_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."curriculum_versions"("id") ON DELETE no action ON UPDATE no action;