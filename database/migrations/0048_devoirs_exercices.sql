CREATE TABLE "assignment_exercises" (
	"assignment_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "assignment_exercises_assignment_id_exercise_id_pk" PRIMARY KEY("assignment_id","exercise_id")
);
--> statement-breakpoint
ALTER TABLE "assignment_submissions" ADD COLUMN "results" jsonb;--> statement-breakpoint
ALTER TABLE "assignment_submissions" ADD COLUMN "attempt_id" uuid;--> statement-breakpoint
ALTER TABLE "assignment_exercises" ADD CONSTRAINT "assignment_exercises_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_exercises" ADD CONSTRAINT "assignment_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assignment_exercises_exercise_idx" ON "assignment_exercises" USING btree ("exercise_id");