'use server'

import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { auth } from '@/auth'
import { db } from '@/db'
import {
  concepts,
  conceptTags,
  subjects,
  subjectConceptOrders,
  subtopics,
  tags,
  topics,
} from '@/db/schema'
import { conceptInputSchema, updateConceptContentSchema, updateConceptFieldSchema } from '@/lib/validations'
import type { Concept, ConceptInput, ConceptPriority, ConceptState } from '@/lib/types'

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

async function requireAuth(): Promise<string> {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Unauthorized')
  return session.user.id
}

// ---------------------------------------------------------------------------
// Resolve-or-create helper: given a list of names + table, return their IDs.
// Creates any that don't already exist for this user.
// ---------------------------------------------------------------------------

async function resolveOrCreate(
  userId: string,
  names: string[],
  table: typeof subjects | typeof topics | typeof subtopics | typeof tags
): Promise<string[]> {
  if (names.length === 0) return []

  const trimmed = names.map((n) => n.trim()).filter(Boolean)
  if (trimmed.length === 0) return []

  // Fetch existing rows for this user
  const existing = await db
    .select({ id: table.id, name: table.name })
    .from(table)
    .where(eq(table.userId, userId))

  const existingMap = new Map(existing.map((r) => [r.name.toLowerCase(), r.id]))
  const ids: string[] = []
  const toInsert: { userId: string; name: string }[] = []

  for (const name of trimmed) {
    const key = name.toLowerCase()
    if (existingMap.has(key)) {
      ids.push(existingMap.get(key)!)
    } else {
      const tempId = crypto.randomUUID()
      existingMap.set(key, tempId)
      toInsert.push({ userId, name })
      ids.push(tempId)
    }
  }

  if (toInsert.length > 0) {
    await db
      .insert(table)
      .values(toInsert)
      .onConflictDoNothing()
      .returning({ id: table.id, name: table.name })

    // Re-fetch to get correct IDs (onConflictDoNothing may skip inserts)
    const refetched = await db
      .select({ id: table.id, name: table.name })
      .from(table)
      .where(
        and(
          eq(table.userId, userId),
          inArray(
            table.name,
            toInsert.map((r) => r.name)
          )
        )
      )

    const refetchedMap = new Map(refetched.map((r) => [r.name.toLowerCase(), r.id]))

    // Replace temp IDs with real IDs
    return trimmed.map((name) => {
      const key = name.toLowerCase()
      return refetchedMap.get(key) ?? existingMap.get(key)!
    })
  }

  return ids
}

// ---------------------------------------------------------------------------
// Prune orphaned subjects/topics/subtopics/tags for a user
// (rows no longer referenced by any concept)
// ---------------------------------------------------------------------------

async function pruneOrphans(userId: string): Promise<void> {
  // Subjects no longer referenced by any concept's subject_id FK
  const usedSubjectIds = db
    .selectDistinct({ subjectId: concepts.subjectId })
    .from(concepts)
    .where(and(eq(concepts.userId, userId), isNotNull(concepts.subjectId)))

  await db
    .delete(subjects)
    .where(
      and(
        eq(subjects.userId, userId),
        sql`${subjects.id} NOT IN (${usedSubjectIds})`
      )
    )

  // Topics no longer referenced by any concept's topic_id FK
  const usedTopicIds = db
    .selectDistinct({ topicId: concepts.topicId })
    .from(concepts)
    .where(and(eq(concepts.userId, userId), isNotNull(concepts.topicId)))

  await db
    .delete(topics)
    .where(
      and(
        eq(topics.userId, userId),
        sql`${topics.id} NOT IN (${usedTopicIds})`
      )
    )

  // Subtopics no longer referenced by any concept's subtopic_id FK
  const usedSubtopicIds = db
    .selectDistinct({ subtopicId: concepts.subtopicId })
    .from(concepts)
    .where(and(eq(concepts.userId, userId), isNotNull(concepts.subtopicId)))

  await db
    .delete(subtopics)
    .where(
      and(
        eq(subtopics.userId, userId),
        sql`${subtopics.id} NOT IN (${usedSubtopicIds})`
      )
    )

  // Tags with no concepts (via junction table)
  const usedTagIds = db
    .select({ tagId: conceptTags.tagId })
    .from(conceptTags)
    .innerJoin(concepts, eq(concepts.id, conceptTags.conceptId))
    .where(eq(concepts.userId, userId))

  await db
    .delete(tags)
    .where(
      and(
        eq(tags.userId, userId),
        sql`${tags.id} NOT IN (${usedTagIds})`
      )
    )
}

// ---------------------------------------------------------------------------
// Attach junction data (tags only — subject/topic/subtopic are direct FKs)
// ---------------------------------------------------------------------------

async function attachTagJunctions(
  conceptIds: string[]
): Promise<Map<string, { tagIds: string[] }>> {
  if (conceptIds.length === 0) return new Map()

  const ctg = await db
    .select({ conceptId: conceptTags.conceptId, tagId: conceptTags.tagId })
    .from(conceptTags)
    .where(inArray(conceptTags.conceptId, conceptIds))

  const map = new Map<string, { tagIds: string[] }>()

  for (const id of conceptIds) {
    map.set(id, { tagIds: [] })
  }

  for (const row of ctg) map.get(row.conceptId)?.tagIds.push(row.tagId)

  return map
}

// ---------------------------------------------------------------------------
// Public actions
// ---------------------------------------------------------------------------

export async function getConcepts(): Promise<Concept[]> {
  const userId = await requireAuth()

  const rows = await db
    .select()
    .from(concepts)
    .where(eq(concepts.userId, userId))
    .orderBy(concepts.name)

  const ids = rows.map((r) => r.id)
  const tagJunctions = await attachTagJunctions(ids)

  return rows.map((row) => ({
    ...row,
    tagIds: tagJunctions.get(row.id)?.tagIds ?? [],
  }))
}

export async function getConcept(id: string): Promise<Concept | null> {
  const userId = await requireAuth()

  const row = await db
    .select()
    .from(concepts)
    .where(and(eq(concepts.id, id), eq(concepts.userId, userId)))
    .then((rows) => rows[0] ?? null)

  if (!row) return null

  const tagJunctions = await attachTagJunctions([id])
  const tagIds = tagJunctions.get(id)?.tagIds ?? []

  // Fetch names for the concept view
  const [subjectRow, topicRow, subtopicRow, tagRows] = await Promise.all([
    row.subjectId
      ? db
          .select({ name: subjects.name })
          .from(subjects)
          .where(eq(subjects.id, row.subjectId))
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
    row.topicId
      ? db
          .select({ name: topics.name })
          .from(topics)
          .where(eq(topics.id, row.topicId))
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
    row.subtopicId
      ? db
          .select({ name: subtopics.name })
          .from(subtopics)
          .where(eq(subtopics.id, row.subtopicId))
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
    tagIds.length > 0
      ? db
          .select({ id: tags.id, name: tags.name })
          .from(tags)
          .where(inArray(tags.id, tagIds))
      : Promise.resolve([]),
  ])

  return {
    ...row,
    tagIds,
    subjectName: subjectRow?.name ?? null,
    tagNames: tagRows.map((r) => r.name),
    topicName: topicRow?.name ?? null,
    subtopicName: subtopicRow?.name ?? null,
  }
}

export async function createConcept(input: ConceptInput): Promise<string> {
  const userId = await requireAuth()
  const parsed = conceptInputSchema.parse(input)

  const [resolvedSubjectIds, resolvedTopicIds, resolvedSubtopicIds, tagIds] = await Promise.all([
    parsed.subjectName ? resolveOrCreate(userId, [parsed.subjectName], subjects) : Promise.resolve([]),
    parsed.topicName ? resolveOrCreate(userId, [parsed.topicName], topics) : Promise.resolve([]),
    parsed.subtopicName ? resolveOrCreate(userId, [parsed.subtopicName], subtopics) : Promise.resolve([]),
    resolveOrCreate(userId, parsed.tagNames, tags),
  ])

  const subjectId = resolvedSubjectIds[0] ?? null
  const topicId = resolvedTopicIds[0] ?? null
  const subtopicId = resolvedSubtopicIds[0] ?? null

  const [concept] = await db
    .insert(concepts)
    .values({
      userId,
      name: parsed.name,
      mvkNotes: parsed.mvkNotes,
      markdownNotes: parsed.markdownNotes,
      referencesMarkdown: parsed.referencesMarkdown,
      state: parsed.state,
      priority: parsed.priority,
      pinned: parsed.pinned,
      subjectId,
      topicId,
      subtopicId,
    })
    .returning({ id: concepts.id })

  const conceptId = concept.id

  if (tagIds.length > 0) {
    await db
      .insert(conceptTags)
      .values(tagIds.map((tagId) => ({ conceptId, tagId })))
      .onConflictDoNothing()
  }

  // Initialize subject_concept_orders if subject has a custom sort order already
  if (subjectId) {
    const maxPos = await db
      .select({ pos: subjectConceptOrders.position })
      .from(subjectConceptOrders)
      .where(
        and(
          eq(subjectConceptOrders.userId, userId),
          eq(subjectConceptOrders.subjectId, subjectId)
        )
      )
      .orderBy(sql`${subjectConceptOrders.position} DESC`)
      .limit(1)

    if (maxPos.length > 0) {
      await db
        .insert(subjectConceptOrders)
        .values({
          userId,
          subjectId,
          conceptId,
          position: maxPos[0].pos + 1,
        })
        .onConflictDoNothing()
    }
  }

  return conceptId
}

export async function updateConcept(id: string, input: ConceptInput): Promise<void> {
  const userId = await requireAuth()
  const parsed = conceptInputSchema.parse(input)

  // Verify ownership and get current subjectId
  const existing = await db
    .select({ id: concepts.id, subjectId: concepts.subjectId })
    .from(concepts)
    .where(and(eq(concepts.id, id), eq(concepts.userId, userId)))
    .then((rows) => rows[0] ?? null)

  if (!existing) throw new Error('Not found')

  // Get current tag junctions
  const tagJunctions = await attachTagJunctions([id])
  const currentTagIds = tagJunctions.get(id)?.tagIds ?? []

  const [resolvedSubjectIds, resolvedTopicIds, resolvedSubtopicIds, newTagIds] = await Promise.all([
    parsed.subjectName ? resolveOrCreate(userId, [parsed.subjectName], subjects) : Promise.resolve([]),
    parsed.topicName ? resolveOrCreate(userId, [parsed.topicName], topics) : Promise.resolve([]),
    parsed.subtopicName ? resolveOrCreate(userId, [parsed.subtopicName], subtopics) : Promise.resolve([]),
    resolveOrCreate(userId, parsed.tagNames, tags),
  ])

  const newSubjectId = resolvedSubjectIds[0] ?? null
  const newTopicId = resolvedTopicIds[0] ?? null
  const newSubtopicId = resolvedSubtopicIds[0] ?? null

  await db
    .update(concepts)
    .set({
      name: parsed.name,
      subjectId: newSubjectId,
      topicId: newTopicId,
      subtopicId: newSubtopicId,
      updatedAt: new Date(),
    })
    .where(and(eq(concepts.id, id), eq(concepts.userId, userId)))

  // Diff and update tag junction table
  const oldTagSet = new Set(currentTagIds)
  const newTagSet = new Set(newTagIds)
  const toAddTags = newTagIds.filter((tid) => !oldTagSet.has(tid))
  const toRemoveTags = currentTagIds.filter((tid) => !newTagSet.has(tid))

  await Promise.all([
    toAddTags.length > 0
      ? db
          .insert(conceptTags)
          .values(toAddTags.map((tagId) => ({ conceptId: id, tagId })))
          .onConflictDoNothing()
      : Promise.resolve(),
    toRemoveTags.length > 0
      ? db
          .delete(conceptTags)
          .where(
            and(
              eq(conceptTags.conceptId, id),
              inArray(conceptTags.tagId, toRemoveTags)
            )
          )
      : Promise.resolve(),
  ])

  // Handle subject_concept_orders when subject changes
  const oldSubjectId = existing.subjectId
  if (oldSubjectId !== newSubjectId) {
    // Remove order entry for old subject
    if (oldSubjectId) {
      await db
        .delete(subjectConceptOrders)
        .where(
          and(
            eq(subjectConceptOrders.userId, userId),
            eq(subjectConceptOrders.conceptId, id),
            eq(subjectConceptOrders.subjectId, oldSubjectId)
          )
        )
    }

    // Add order entry for new subject if it already has a custom order
    if (newSubjectId) {
      const maxPos = await db
        .select({ pos: subjectConceptOrders.position })
        .from(subjectConceptOrders)
        .where(
          and(
            eq(subjectConceptOrders.userId, userId),
            eq(subjectConceptOrders.subjectId, newSubjectId)
          )
        )
        .orderBy(sql`${subjectConceptOrders.position} DESC`)
        .limit(1)

      if (maxPos.length > 0) {
        await db
          .insert(subjectConceptOrders)
          .values({ userId, subjectId: newSubjectId, conceptId: id, position: maxPos[0].pos + 1 })
          .onConflictDoNothing()
      }
    }
  }

  await pruneOrphans(userId)
}

export async function deleteConcept(id: string): Promise<void> {
  const userId = await requireAuth()

  await db
    .delete(concepts)
    .where(and(eq(concepts.id, id), eq(concepts.userId, userId)))

  await pruneOrphans(userId)
}

export async function updateConceptField(
  id: string,
  field: 'state' | 'priority' | 'pinned',
  value: ConceptState | ConceptPriority | boolean
): Promise<void> {
  const userId = await requireAuth()
  const parsed = updateConceptFieldSchema.parse({ id, field, value })

  await db
    .update(concepts)
    .set({ [parsed.field]: parsed.value, updatedAt: new Date() })
    .where(and(eq(concepts.id, id), eq(concepts.userId, userId)))
}

export async function updateConceptContent(
  id: string,
  field: 'mvkNotes' | 'markdownNotes' | 'referencesMarkdown',
  value: string
): Promise<void> {
  const userId = await requireAuth()
  const parsed = updateConceptContentSchema.parse({ id, field, value })

  await db
    .update(concepts)
    .set({ [parsed.field]: parsed.value, updatedAt: new Date() })
    .where(and(eq(concepts.id, id), eq(concepts.userId, userId)))
}

export async function incrementReview(id: string): Promise<void> {
  const userId = await requireAuth()

  await db
    .update(concepts)
    .set({
      reviewCount: sql`${concepts.reviewCount} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(concepts.id, id), eq(concepts.userId, userId)))
}

export async function decrementReview(id: string): Promise<void> {
  const userId = await requireAuth()

  await db
    .update(concepts)
    .set({
      reviewCount: sql`GREATEST(0, ${concepts.reviewCount} - 1)`,
      updatedAt: new Date(),
    })
    .where(and(eq(concepts.id, id), eq(concepts.userId, userId)))
}
