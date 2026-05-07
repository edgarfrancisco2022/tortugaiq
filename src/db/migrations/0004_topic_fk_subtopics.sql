CREATE TABLE "subtopics" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "concepts" ADD COLUMN "topic_id" text;
--> statement-breakpoint
ALTER TABLE "concepts" ADD COLUMN "subtopic_id" text;
--> statement-breakpoint
UPDATE "concepts" c SET "topic_id" = (SELECT ct."topic_id" FROM "concept_topics" ct WHERE ct."concept_id" = c."id" ORDER BY ct."topic_id" LIMIT 1);
--> statement-breakpoint
DROP TABLE "concept_topics";
--> statement-breakpoint
ALTER TABLE "subtopics" ADD CONSTRAINT "subtopics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "concepts" ADD CONSTRAINT "concepts_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "concepts" ADD CONSTRAINT "concepts_subtopic_id_subtopics_id_fk" FOREIGN KEY ("subtopic_id") REFERENCES "public"."subtopics"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "subtopics" ADD CONSTRAINT "subtopics_user_id_name_unique" UNIQUE("user_id","name");
