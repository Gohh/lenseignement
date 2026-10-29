CREATE TABLE "help_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"mime" text NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "help_attachments_once" UNIQUE("question_id","kind"),
	CONSTRAINT "help_attachments_kind_check" CHECK ("help_attachments"."kind" in ('photo','audio'))
);
--> statement-breakpoint
ALTER TABLE "help_attachments" ADD CONSTRAINT "help_attachments_question_id_help_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."help_questions"("id") ON DELETE cascade ON UPDATE no action;