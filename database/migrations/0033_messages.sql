CREATE TABLE "parent_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_user_id" uuid NOT NULL,
	"teacher_user_id" uuid NOT NULL,
	"learner_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "parent_conversations_trio" UNIQUE("parent_user_id","teacher_user_id","learner_user_id")
);
--> statement-breakpoint
CREATE TABLE "parent_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "parent_conversations" ADD CONSTRAINT "parent_conversations_parent_user_id_users_id_fk" FOREIGN KEY ("parent_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_conversations" ADD CONSTRAINT "parent_conversations_teacher_user_id_users_id_fk" FOREIGN KEY ("teacher_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_conversations" ADD CONSTRAINT "parent_conversations_learner_user_id_users_id_fk" FOREIGN KEY ("learner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_messages" ADD CONSTRAINT "parent_messages_conversation_id_parent_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."parent_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_messages" ADD CONSTRAINT "parent_messages_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "parent_conversations_teacher_idx" ON "parent_conversations" USING btree ("teacher_user_id");--> statement-breakpoint
CREATE INDEX "parent_messages_conversation_idx" ON "parent_messages" USING btree ("conversation_id","created_at");