# 05 — Server Actions

## What Are Server Actions?

Server Actions are TypeScript functions marked with the `'use server'` directive that execute on the server but can be called directly from client components — without writing an HTTP endpoint, a URL, or a `fetch()` call.

This is the key innovation that allows TortugaIQ to have no separate backend. Compare:

**Spring Boot REST approach:**
```java
// Backend
@RestController
public class ConceptController {
  @PostMapping("/api/concepts")
  public ResponseEntity<String> createConcept(@RequestBody @Valid ConceptInput input) {
    String id = conceptService.create(input);
    return ResponseEntity.ok(id);
  }
}

// Frontend
const response = await fetch('/api/concepts', {
  method: 'POST',
  body: JSON.stringify(input),
})
const id = await response.json()
```

**Next.js Server Action approach:**
```typescript
// src/actions/concepts.ts — runs on the server
'use server'

export async function createConcept(input: ConceptInput): Promise<string> {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Unauthorized')
  // ... insert to DB
  return newConceptId
}

// Client component — looks like a regular function call
import { createConcept } from '@/actions/concepts'
const id = await createConcept(input)
```

Next.js automatically serializes the arguments to JSON, POSTs to an internal endpoint (`/_next/action`), runs the function on the server, and returns the serialized result. The client code doesn't know or care about the network call.

---

## The Security Contract

**Every Server Action in this app must start with these lines:**

```typescript
export async function anyAction(input: SomeInput) {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Unauthorized')
  const userId = session.user.id

  // Every DB query uses this userId:
  // where(eq(table.userId, userId))
}
```

**Why this is non-negotiable:**

Server Actions are called from the browser. A malicious user could call your Server Action with arbitrary arguments. If you accepted `userId` from the function input, they could read or modify any user's data.

The `userId` must always come from the **server-side session** (`auth()`), which is cryptographically verified and cannot be forged by the client.

See also: [09 — Security](./09-security.md).

---

## Zod Validation in Actions

Even if the client validates inputs (e.g., in a form), the server re-validates. This is defense-in-depth — the client can be bypassed by calling the action directly.

```typescript
export async function createConcept(input: ConceptInput): Promise<string> {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Unauthorized')
  const userId = session.user.id

  // Server-side validation — rejects malformed input
  const validated = conceptInputSchema.parse(input)
  // validated is now typed correctly by Zod

  // ... proceed with validated data
}
```

Think of this like `@Valid` + Bean Validation in Spring Boot — the annotation on the controller method is the client-side guard, but the service layer still validates.

---

## Action Files

### `src/actions/concepts.ts`

#### `getConcepts() → Promise<Concept[]>`

Fetches all concepts for the authenticated user. `subjectId`, `topicId`, and `subtopicId` come directly from the concept row — no junction query needed. `tagIds` are fetched via the `concept_tags` junction in a single batch query.

```typescript
export async function getConcepts(): Promise<Concept[]> {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Unauthorized')
  const userId = session.user.id

  const rows = await db
    .select()
    .from(concepts)
    .where(eq(concepts.userId, userId))
    .orderBy(asc(concepts.name))

  // Attach tag junction data only — subject/topic/subtopic are direct FKs on the row
  const ids = rows.map((r) => r.id)
  const tagMap = await attachTagJunctions(userId, ids)

  return rows.map((r) => ({
    ...r,
    subjectId:  r.subjectId,  // direct FK on the row
    topicId:    r.topicId,    // direct FK on the row
    subtopicId: r.subtopicId, // direct FK on the row
    tagIds:     tagMap.get(r.id)?.tagIds ?? [],
  }))
}
```

#### `getConcept(id) → Promise<Concept | null>`

Single concept with full junction data INCLUDING names (not just IDs). Used by ConceptView.

#### `createConcept(input) → Promise<string>`

The most complex action. Steps:
1. Validate input with Zod
2. `resolveOrCreate()` subject, topic, subtopic, and tags by name
3. Insert concept row with `subjectId`/`topicId`/`subtopicId` set directly as FKs
4. Insert junction rows for tags only (`conceptTags`)
5. If the subject uses custom sort mode, append new concept to its order list
6. Return new concept ID

#### `updateConcept(id, input) → Promise<void>`

Updates concept name, `subjectId`/`topicId`/`subtopicId` FKs, and the tag junction. Steps:
1. Verify ownership
2. Update concept row — name, `subjectId`, `topicId`, `subtopicId` directly
3. Diff old vs new tag junctions → add new ones, remove dropped ones
4. Update sort orders if subject changed (remove old order entry, add to new subject's order if it has custom sort)
5. `pruneOrphans()` — clean up any now-unreferenced subjects/topics/subtopics/tags

#### `deleteConcept(id) → Promise<void>`

Deletes concept (FK cascade removes junction rows; `topic_id`/`subtopic_id` become irrelevant). Then `pruneOrphans()`.

#### `updateConceptField(id, field, value) → Promise<void>`

Narrow update: only `state`, `priority`, or `pinned`. Validated at runtime with `updateConceptFieldSchema.parse()` — prevents accidentally passing a content field name or an invalid enum value even through a direct action call.

```typescript
// Only these fields can be updated here — validated by Zod at runtime
type FieldName = 'state' | 'priority' | 'pinned'
```

#### `updateConceptContent(id, field, value) → Promise<void>`

Narrow update: only `mvkNotes`, `markdownNotes`, or `referencesMarkdown`. Used by MarkdownEditor's save button. Separate from `updateConceptField` to prevent race conditions between saves. Content fields are validated with `.max(100000)` — a 100 KB limit that prevents clients from storing unbounded strings.

#### `incrementReview(id) → Promise<void>`

```typescript
await db.update(concepts)
  .set({ reviewCount: sql`${concepts.reviewCount} + 1`, updatedAt: new Date() })
  .where(and(eq(concepts.id, id), eq(concepts.userId, userId)))
```

#### `decrementReview(id) → Promise<void>`

```typescript
// GREATEST prevents going below 0 at the SQL level
await db.update(concepts)
  .set({ reviewCount: sql`GREATEST(0, ${concepts.reviewCount} - 1)`, updatedAt: new Date() })
  .where(and(eq(concepts.id, id), eq(concepts.userId, userId)))
```

---

### `src/actions/subjects.ts`

#### `getSubjects() → Promise<(Subject & { conceptCount: number })[]>`

Returns subjects with a count of how many concepts each contains:

```typescript
const rows = await db
  .select({
    ...getTableColumns(subjects),
    conceptCount: sql<number>`count(${concepts.id})::int`,
  })
  .from(subjects)
  .leftJoin(concepts, and(eq(concepts.subjectId, subjects.id), eq(concepts.userId, userId)))
  .where(eq(subjects.userId, userId))
  .groupBy(subjects.id)
  .orderBy(asc(subjects.name))
```

LEFT JOIN on `subject_id` (direct FK): subjects with zero concepts still appear (count = 0). The `concepts.userId` guard prevents cross-user contamination.

#### `getTopics() → Promise<Topic[]>`

All topics for the user, ordered by name.

#### `getTags() → Promise<Tag[]>`

All tags for the user, ordered by name.

#### `getSubjectSortMode(subjectId) → Promise<SubjectSortMode>`

Returns the sort mode for a subject, defaulting to `'alpha'` if no preference is saved:

```typescript
const row = await db.query.subjectSortModes.findFirst({
  where: and(
    eq(subjectSortModes.userId, userId),
    eq(subjectSortModes.subjectId, subjectId)
  ),
})
return (row?.mode as SubjectSortMode) ?? 'alpha'
```

#### `setSubjectSortMode(subjectId, mode) → Promise<void>`

When switching TO `'custom'` for the first time, initializes `subject_concept_orders` from the current date-ordered list:

```typescript
if (mode === 'custom') {
  const existingOrders = await db.select()
    .from(subjectConceptOrders)
    .where(...)

  if (existingOrders.length === 0) {
    // Get current concepts in date order and snapshot their positions
    const currentConcepts = await db.select(...)
    await db.insert(subjectConceptOrders).values(
      currentConcepts.map((c, i) => ({
        userId,
        subjectId,
        conceptId: c.id,
        position: i,
      }))
    )
  }
}

// Upsert the sort mode preference
await db.insert(subjectSortModes)
  .values({ userId, subjectId, mode })
  .onConflictDoUpdate({ ... })
```

#### `getSubjectConceptOrder(subjectId) → Promise<string[]>`

Returns concept IDs in position order for custom sorting.

#### `moveConceptInSubject(subjectId, conceptId, direction) → Promise<void>`

Swaps adjacent positions:

```typescript
const allOrders = await db.select()
  .from(subjectConceptOrders)
  .where(...)
  .orderBy(asc(subjectConceptOrders.position))

const idx = allOrders.findIndex((o) => o.conceptId === conceptId)
if (idx === -1) return

const swapIdx = direction === 'up' ? idx - 1 : idx + 1
if (swapIdx < 0 || swapIdx >= allOrders.length) return  // boundary check

// Swap positions
const a = allOrders[idx]
const b = allOrders[swapIdx]
await Promise.all([
  db.update(subjectConceptOrders).set({ position: b.position }).where(...a...),
  db.update(subjectConceptOrders).set({ position: a.position }).where(...b...),
])
```

---

### `src/actions/study-sessions.ts`

#### `getStudySessions() → Promise<StudySession[]>`

All sessions for the user, newest first.

#### `addStudySession({ minutes, subjectId? }) → Promise<StudySession>`

Validates input (minutes must be a positive integer ≤ 1440), inserts, returns the full row.

#### `updateStudySession(id, { minutes, subjectId }) → Promise<void>`

Validates ownership (the row must belong to `userId`), then updates.

#### `deleteStudySession(id) → Promise<void>`

Validates ownership, then deletes.

---

### `src/actions/auth.ts`

#### `signUpWithCredentials({ email, name, password }) → Promise<{ error?: string }>`

```typescript
// 1. Validate with Zod
const validated = signUpSchema.parse(input)

// 2. Check for existing email
const existing = await db.query.users.findFirst({
  where: eq(users.email, validated.email.toLowerCase()),
})
if (existing) return { error: 'Email already in use' }

// 3. Hash password
const passwordHash = await bcrypt.hash(validated.password, 12)

// 4. Insert user
await db.insert(users).values({
  email: validated.email.toLowerCase(),
  name: validated.name,
  passwordHash,
})

// 5. Sign in immediately
await signIn('credentials', { email: validated.email, password: validated.password })
```

Note: `signIn()` is an Auth.js Server Action helper. After a successful credentials sign-up, the user is logged in automatically without having to go to the sign-in page.

#### `requestPasswordReset({ email }) → Promise<void>`

Always returns success (no email enumeration). Internally:
- Finds user by email
- If found: invalidate all existing unused reset tokens for this user, generate a new token, store in DB, send email via nodemailer (Gmail)
- If not found: silently does nothing (same success response)

#### `resetPassword({ token, newPassword }) → Promise<{ error?: string }>`

Validates the token: must exist, not expired, not already used. If valid, hashes and stores the new password, marks token used, and sends a "your password was changed" confirmation email to the user.

#### `createGuestUser() → Promise<{ email: string; password: string }>`

Creates a guest account with `isGuest: true` and returns the auto-generated credentials for client-side storage.

---

## Helper Functions

### `resolveOrCreate(userId, names, table) → Promise<string[]>`

Given a list of names (e.g., `['Machine Learning', 'Python']`), returns their IDs — creating them if they don't exist:

```typescript
async function resolveOrCreate(
  userId: string,
  names: string[],
  table: typeof subjects | typeof topics | typeof tags
): Promise<string[]> {
  if (names.length === 0) return []

  // Insert all names, ignoring conflicts (name already exists for this user)
  await db.insert(table)
    .values(names.map((name) => ({ userId, name })))
    .onConflictDoNothing()

  // Fetch back the IDs (handles both newly created and pre-existing)
  const rows = await db.select({ id: table.id, name: table.name })
    .from(table)
    .where(and(eq(table.userId, userId), inArray(table.name, names)))

  // Return IDs in the same order as the input names
  return names.map((name) =>
    rows.find((r) => r.name === name)!.id
  )
}
```

The `onConflictDoNothing()` handles race conditions: if two concurrent requests try to create the same subject simultaneously, only one wins and the other is silently ignored. Then both fetch the existing ID.

### `attachTagJunctions(userId, conceptIds) → Promise<Map>`

Batch-fetches all tag junction rows for a list of concept IDs. Tags are the only remaining M:M relationship — subjects, topics, and subtopics are now all direct FKs on the concept row.

```typescript
const tagRows = await db
  .select()
  .from(conceptTags)
  .where(inArray(conceptTags.conceptId, conceptIds))

// Build Map<conceptId, { tagIds }>
```

This avoids N+1 queries — all tag junctions for all concepts are fetched in a single query.

### `pruneOrphans(userId) → Promise<void>`

Deletes subjects, topics, subtopics, and tags no longer referenced by any concept:

```typescript
// Delete subjects not referenced by any concept's subject_id (direct FK — same pattern as topics)
const usedSubjectIds = db.selectDistinct({ subjectId: concepts.subjectId })
  .from(concepts)
  .where(and(eq(concepts.userId, userId), isNotNull(concepts.subjectId)))
await db.delete(subjects).where(
  and(eq(subjects.userId, userId), sql`${subjects.id} NOT IN (${usedSubjectIds})`)
)
// Delete topics not referenced by any concept's topic_id
await db.delete(topics).where(
  and(
    eq(topics.userId, userId),
    notInArray(
      topics.id,
      db.selectDistinct({ topicId: concepts.topicId })
        .from(concepts)
        .where(and(eq(concepts.userId, userId), isNotNull(concepts.topicId)))
    )
  )
)
// Same pattern for subtopics (subtopic_id column)
// Tags: notInArray against concept_tags junction
// All four run in parallel with Promise.all
```

This runs after `deleteConcept` and after `updateConcept`. It keeps the taxonomy clean automatically — no orphaned topics or subtopics remain after their last concept is updated or deleted.

---

## Why Narrow Updates?

`updateConceptField` and `updateConceptContent` are separate from `updateConcept`. Why?

1. **Avoid race conditions**: If you save state ("LEARNING") and notes simultaneously, a single `UPDATE concepts SET state=?, mvk_notes=?, ...` with all fields would let the last write win — potentially overwriting a note save with a stale state. Narrow updates touch only the field being changed.

2. **Optimistic updates**: The TanStack Query hooks can apply optimistic updates to only the field being changed without knowing the full concept state.

3. **Security**: `updateConcept` is for the form (name, subjects, topics, tags). Keeping content updates separate prevents the form from accidentally overwriting content fields.
