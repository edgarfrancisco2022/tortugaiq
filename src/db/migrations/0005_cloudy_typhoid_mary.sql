ALTER TABLE "concepts" ADD COLUMN "subject_id" text;--> statement-breakpoint
ALTER TABLE "concepts" ADD CONSTRAINT "concepts_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
UPDATE "concepts" c
SET "subject_id" = (
  SELECT cs."subject_id"
  FROM "concept_subjects" cs
  WHERE cs."concept_id" = c."id"
  ORDER BY cs."subject_id"
  LIMIT 1
);--> statement-breakpoint
DELETE FROM "subject_concept_orders" sco
WHERE NOT EXISTS (
  SELECT 1 FROM "concepts" c
  WHERE c."id" = sco."concept_id"
  AND c."subject_id" = sco."subject_id"
);--> statement-breakpoint
ALTER TABLE "concept_subjects" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "concept_subjects" CASCADE;
