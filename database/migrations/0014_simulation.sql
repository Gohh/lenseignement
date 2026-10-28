CREATE TABLE "practice_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"simulation_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "practice_requests_once" UNIQUE("user_id","simulation_id")
);
--> statement-breakpoint
CREATE TABLE "safety_simulations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"curriculum_version_id" uuid NOT NULL,
	"competency_id" uuid NOT NULL,
	"practice_competency_id" uuid NOT NULL,
	"steps" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "safety_simulations_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "simulation_attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"simulation_id" uuid NOT NULL,
	"passed" boolean NOT NULL,
	"answers" jsonb NOT NULL,
	"results" jsonb NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "practice_requests" ADD CONSTRAINT "practice_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_requests" ADD CONSTRAINT "practice_requests_simulation_id_safety_simulations_id_fk" FOREIGN KEY ("simulation_id") REFERENCES "public"."safety_simulations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_requests" ADD CONSTRAINT "practice_requests_attempt_id_simulation_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."simulation_attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_simulations" ADD CONSTRAINT "safety_simulations_curriculum_version_id_curriculum_versions_id_fk" FOREIGN KEY ("curriculum_version_id") REFERENCES "public"."curriculum_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_simulations" ADD CONSTRAINT "safety_simulations_competency_id_competencies_id_fk" FOREIGN KEY ("competency_id") REFERENCES "public"."competencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_simulations" ADD CONSTRAINT "safety_simulations_practice_competency_id_competencies_id_fk" FOREIGN KEY ("practice_competency_id") REFERENCES "public"."competencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulation_attempts" ADD CONSTRAINT "simulation_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulation_attempts" ADD CONSTRAINT "simulation_attempts_simulation_id_safety_simulations_id_fk" FOREIGN KEY ("simulation_id") REFERENCES "public"."safety_simulations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "simulation_attempts_user_idx" ON "simulation_attempts" USING btree ("user_id","simulation_id","submitted_at");