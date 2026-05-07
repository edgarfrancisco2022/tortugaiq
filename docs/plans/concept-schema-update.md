# Concept Schema Update: Topic → Single FK + New Subtopic

## Context

The upcoming Outline feature will pregenerate content from concept Topic and Subtopic metadata. For that to work reliably, each concept must have at most one Topic and one Subtopic. Currently, Topic is a many-to-many junction (`concept_topics`), which allows multiple topics per concept. This update:

1. Converts Topic from M:M to many-to-one (direct FK on `concepts.topic_id`)
2. Introduces a new `Subtopic` entity with the same many-to-one relationship
3. Preserves all existing topic assignments (taking the first by `topic_id` ASC when a concept has more than one)
4. Updates the ConceptForm UI to enforce single-selection for both fields
5. Adds subtopic filtering to SubjectView, ListMode (Library), FocusMode, and IndexMode

---

## Schema Changes (`src/db/schema.ts`)

### Remove
- `conceptTopics` junction table (M:M `concept_topics`)

### Add
- `subtopics` table — same shape as `topics` (id, userId, name, createdAt, updatedAt), unique `(userId, name)`
- `concepts.topicId` — nullable UUID FK → `topics.id` ON DELETE SET NULL
- `concepts.subtopicId` — nullable UUID FK → `subtopics.id` ON DELETE SET NULL

---

## Migration Strategy

Because this involves a data-preserving schema change, the migration requires a manual edit step:

1. **Edit `src/db/schema.ts`** — make all schema changes above
2. **Run `npx drizzle-kit generate`** — Drizzle generates the SQL migration file
3. **Manually insert a `UPDATE` statement** into the generated SQL, between the ADD COLUMN and DROP TABLE statements:
   ```sql
   -- Preserve existing topic assignments (first topic_id per concept, by UUID order)
   UPDATE "concepts" c
   SET "topic_id" = (
     SELECT ct."topic_id"
     FROM "concept_topics" ct
     WHERE ct."concept_id" = c."id"
     ORDER BY ct."topic_id"
     LIMIT 1
   );
   ```
4. **Run `npx drizzle-kit migrate`** on the local (dev) Neon branch first — verify data integrity
5. **Run `npx drizzle-kit migrate`** on the production Neon branch

The `subtopics` table and `concepts.subtopic_id` carry no existing data — those steps are safe to auto-apply.

---

## Files to Modify

### 1. `src/db/schema.ts`
- Export `subtopics` table (mirrors `topics`)
- Add `topicId` and `subtopicId` nullable FK columns to `concepts`
- Remove `conceptTopics` table definition and its export

### 2. `src/db/migrations/<new>.sql` _(generated, then manually edited)_
- Add `topic_id` and `subtopic_id` columns to `concepts`
- Create `subtopics` table
- **Manual insert:** UPDATE to populate `topic_id` from `concept_topics`
- Drop `concept_topics`

### 3. `src/lib/types.ts`
- Add `Subtopic` interface (same shape as `Topic`)
- Update `Concept`:
  - `topicIds: string[]` → `topicId: string | null`
  - `topicNames?: string[]` → `topicName?: string | null`
  - Add `subtopicId: string | null`
  - Add `subtopicName?: string | null`
- Update `ConceptInput`:
  - `topicNames: string[]` → `topicName: string | null`
  - Add `subtopicName: string | null`

### 4. `src/lib/validations.ts`
- In `conceptInputSchema`:
  - `topicNames: z.array(...)` → `topicName: z.string().trim().min(1).max(200).nullable().default(null)`
  - Add `subtopicName: z.string().trim().min(1).max(200).nullable().default(null)`

### 5. `src/actions/concepts.ts`
- **`createConcept`**: resolve topic/subtopic using existing `resolveOrCreate([name], table)` pattern (wrap single name in array, take `[0]`); set `topicId`/`subtopicId` directly on the inserted concept row; remove `conceptTopics` junction inserts
- **`updateConcept`**: compare old vs new `topicId`/`subtopicId` directly; update `concepts` row; remove junction diff logic for topics; call `pruneOrphans` as before
- **`getConcepts`**: `topicId` and `subtopicId` come directly from the concepts row — no junction query needed; remove `attachJunctions` usage for topics (subjects/tags still use junctions)
- **`getConcept`**: look up topic name via single `db.select().from(topics).where(eq(topics.id, topicId))` instead of `inArray`; same for subtopic
- **`attachJunctions`**: remove `conceptTopics` branch; keep subjects and tags
- **`pruneOrphans`**: update topics prune to use `NOT IN (SELECT DISTINCT topic_id FROM concepts WHERE user_id = ? AND topic_id IS NOT NULL)`; add identical subtopics prune

### 6. `src/actions/subjects.ts`
- Add `getSubtopics()` — identical to `getTopics()` but queries `subtopics`

### 7. `src/hooks/` _(hook location TBC — likely `useTopics.ts` or inline in ConceptForm)_
- Verify `useTopics` hook exists; if not, ConceptForm fetches topics via a TanStack Query call — update to also fetch subtopics
- Add `useSubtopics()` hook parallel to `useTopics()`
- Update `useFilterSort` (or wherever topic filter logic lives):
  - Change `concept.topicIds.includes(filterId)` → `concept.topicId === filterId`
  - Add subtopic filter: `concept.subtopicId === subtopicFilterId`

### 8. `src/components/ui/CreatableMultiSelect.tsx`
- Add a `single?: boolean` prop
- When `single` is true and one item is already selected:
  - Hide the search input
  - Show the pill with a clear indication it's the only allowed item (e.g., "1 max" label or a lock icon)
  - The user can still remove the pill to re-enable input

### 9. `src/components/ui/ConceptForm.tsx`
- Form state: `selTopics: string[]` → `selTopic: string | null`; add `selSubtopic: string | null`
- Topic input: pass `single={true}` to `CreatableMultiSelect`; derive `selected` from `[selTopic].filter(Boolean)`; `onChange` takes the first element or null
- Add Subtopic input below Topic and above Tags: same `CreatableMultiSelect` with `single={true}`, wired to `allSubtopics` options and `selSubtopic` state
- Update form submission to pass `topicName: selTopic` and `subtopicName: selSubtopic`
- When editing an existing concept, seed `selTopic` from `concept.topicName ?? null` and `selSubtopic` from `concept.subtopicName ?? null`

### 10. `src/components/ui/FilterSortBar.tsx`
- Add Subtopic filter dropdown (same pattern as Topic filter)
- Update Topic filter to work with the new `topicId` field on concepts

### 11. Focus, Index, and Subject views
- **SubjectView** (`src/app/(app)/subjects/[subjectId]/page.tsx` or its client component): passes subtopics to filter hook
- **ListMode** (`src/app/(app)/library/`): same
- **FocusMode** (`src/app/(app)/focus/`): if no existing filter UI, add a minimal filter bar or dropdown for Topic and Subtopic
- **IndexMode** (`src/app/(app)/index/`): same as FocusMode

### 12. `src/app/(app)/overview/` (OverviewView)
The OverviewView Catalog section currently shows Topics with concept counts. After this update:

- **Query changes**: Topic count query currently joins `concept_topics`; update to `GROUP BY concepts.topic_id` instead. Add a parallel query for subtopics grouped by `concepts.subtopic_id`.
- **Catalog layout**: Add a Subtopic row/block directly below the Topic block in the Catalog section. Both Topic and Subtopic blocks should follow the same visual pattern (label + count pills or list).
- **Desktop**: Topic and Subtopic can sit side-by-side in two columns within the Catalog card, or stacked vertically if space is tight — match the existing Topic layout exactly for Subtopic.
- **Mobile**: Stack Topic above Subtopic vertically; no horizontal split. Keep the same compact pill/list style used for topics today.
- **Empty state**: If no subtopics exist yet, the Subtopic block should show "No subtopics" (same empty state pattern as Topics).

### 13. Documentation
- **`CLAUDE.md`**: update Data Model (tables, Concept type, ConceptInput type, Hook Inventory, Component Inventory), remove `concept_topics`, add `subtopics`, update topic FK description
- **`docs/architecture/`**: update any relevant architecture docs that describe the concept–topic relationship

---

## Verification

1. **Local migration**: run `npx drizzle-kit migrate` against dev Neon branch; confirm no errors
2. **Data check**: query `SELECT COUNT(*) FROM concepts WHERE topic_id IS NOT NULL` — should be ≥ number of concepts that previously had at least one topic
3. **Create concept**: open ConceptForm → add a Topic → confirm only one is allowed; add a Subtopic → confirm only one allowed; save → verify both appear on the ConceptView
4. **Edit concept**: change Topic on an existing concept → save → verify updated; clear Topic → save → verify null
5. **Filter**: in SubjectView and Library, filter by Topic and by Subtopic — confirm correct concepts shown
6. **Orphan pruning**: delete a concept that is the only one with a given topic → confirm that topic is removed from the topics table
7. **Existing data**: verify that concepts that previously had exactly one topic still show that topic after migration; verify no concept has lost its topic assignment
8. **Production migration**: run against Neon main branch; confirm prod data integrity with a spot check query
