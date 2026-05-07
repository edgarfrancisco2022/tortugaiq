'use server'

import { and, asc, eq, sql } from 'drizzle-orm'
import { auth } from '@/auth'
import { db } from '@/db'
import {
  concepts,
  conceptSubjects,
  subjectConceptOrders,
  subjectSortModes,
  subjects,
  subtopics,
  topics,
  tags,
} from '@/db/schema'
import { sortModeSchema } from '@/lib/validations'
import type { Subject, Subtopic, Topic, Tag, SubjectSortMode } from '@/lib/types'

async function requireAuth(): Promise<string> {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Unauthorized')
  return session.user.id
}

// ---------------------------------------------------------------------------
// Return all topics and tags for the current user
// ---------------------------------------------------------------------------

export async function getTopics(): Promise<Topic[]> {
  const userId = await requireAuth()
  return db.select().from(topics).where(eq(topics.userId, userId)).orderBy(topics.name)
}

export async function getSubtopics(): Promise<Subtopic[]> {
  const userId = await requireAuth()
  return db.select().from(subtopics).where(eq(subtopics.userId, userId)).orderBy(subtopics.name)
}

export async function getTags(): Promise<Tag[]> {
  const userId = await requireAuth()
  return db.select().from(tags).where(eq(tags.userId, userId)).orderBy(tags.name)
}

// ---------------------------------------------------------------------------
// Return all subjects for the current user, with concept counts
// ---------------------------------------------------------------------------

export async function getSubjects(): Promise<(Subject & { conceptCount: number })[]> {
  const userId = await requireAuth()

  const rows = await db
    .select({
      id: subjects.id,
      userId: subjects.userId,
      name: subjects.name,
      createdAt: subjects.createdAt,
      updatedAt: subjects.updatedAt,
      conceptCount: sql<number>`count(${conceptSubjects.conceptId})::int`,
    })
    .from(subjects)
    .leftJoin(conceptSubjects, eq(conceptSubjects.subjectId, subjects.id))
    .where(eq(subjects.userId, userId))
    .groupBy(subjects.id)
    .orderBy(subjects.name)

  return rows
}

// ---------------------------------------------------------------------------
// Sort mode
// ---------------------------------------------------------------------------

export async function getSubjectSortMode(subjectId: string): Promise<SubjectSortMode> {
  const userId = await requireAuth()

  const row = await db
    .select({ mode: subjectSortModes.mode })
    .from(subjectSortModes)
    .where(
      and(
        eq(subjectSortModes.userId, userId),
        eq(subjectSortModes.subjectId, subjectId)
      )
    )
    .then((rows) => rows[0] ?? null)

  return (row?.mode as SubjectSortMode) ?? 'alpha'
}

export async function setSubjectSortMode(
  subjectId: string,
  mode: SubjectSortMode
): Promise<void> {
  const userId = await requireAuth()
  sortModeSchema.parse(mode)

  // Verify the subject belongs to this user
  const subject = await db
    .select({ id: subjects.id })
    .from(subjects)
    .where(and(eq(subjects.id, subjectId), eq(subjects.userId, userId)))
    .then((rows) => rows[0] ?? null)

  if (!subject) throw new Error('Not found')

  // If switching to custom, initialize orders if not already present
  if (mode === 'custom') {
    const existingOrders = await db
      .select({ conceptId: subjectConceptOrders.conceptId })
      .from(subjectConceptOrders)
      .where(
        and(
          eq(subjectConceptOrders.userId, userId),
          eq(subjectConceptOrders.subjectId, subjectId)
        )
      )

    if (existingOrders.length === 0) {
      // Initialize with current date-ordered concept list
      const conceptsInSubject = await db
        .select({ conceptId: conceptSubjects.conceptId, createdAt: concepts.createdAt })
        .from(conceptSubjects)
        .innerJoin(concepts, eq(concepts.id, conceptSubjects.conceptId))
        .where(
          and(
            eq(conceptSubjects.subjectId, subjectId),
            eq(concepts.userId, userId)
          )
        )
        .orderBy(asc(concepts.createdAt))

      if (conceptsInSubject.length > 0) {
        await db.insert(subjectConceptOrders).values(
          conceptsInSubject.map(({ conceptId }, idx) => ({
            userId,
            subjectId,
            conceptId,
            position: idx,
          }))
        )
      }
    }
  }

  await db
    .insert(subjectSortModes)
    .values({ userId, subjectId, mode })
    .onConflictDoUpdate({
      target: [subjectSortModes.userId, subjectSortModes.subjectId],
      set: { mode, updatedAt: new Date() },
    })
}

// ---------------------------------------------------------------------------
// Custom sort order
// ---------------------------------------------------------------------------

export async function getSubjectConceptOrder(subjectId: string): Promise<string[]> {
  const userId = await requireAuth()

  const rows = await db
    .select({ conceptId: subjectConceptOrders.conceptId })
    .from(subjectConceptOrders)
    .where(
      and(
        eq(subjectConceptOrders.userId, userId),
        eq(subjectConceptOrders.subjectId, subjectId)
      )
    )
    .orderBy(asc(subjectConceptOrders.position))

  return rows.map((r) => r.conceptId)
}

export async function moveConceptInSubject(
  subjectId: string,
  conceptId: string,
  direction: 'up' | 'down'
): Promise<void> {
  const userId = await requireAuth()

  const order = await db
    .select({
      conceptId: subjectConceptOrders.conceptId,
      position: subjectConceptOrders.position,
    })
    .from(subjectConceptOrders)
    .where(
      and(
        eq(subjectConceptOrders.userId, userId),
        eq(subjectConceptOrders.subjectId, subjectId)
      )
    )
    .orderBy(asc(subjectConceptOrders.position))

  const idx = order.findIndex((r) => r.conceptId === conceptId)
  if (idx === -1) return

  const newIdx = direction === 'up' ? idx - 1 : idx + 1
  if (newIdx < 0 || newIdx >= order.length) return

  const current = order[idx]
  const neighbor = order[newIdx]

  // Swap positions
  await Promise.all([
    db
      .update(subjectConceptOrders)
      .set({ position: neighbor.position, updatedAt: new Date() })
      .where(
        and(
          eq(subjectConceptOrders.userId, userId),
          eq(subjectConceptOrders.subjectId, subjectId),
          eq(subjectConceptOrders.conceptId, current.conceptId)
        )
      ),
    db
      .update(subjectConceptOrders)
      .set({ position: current.position, updatedAt: new Date() })
      .where(
        and(
          eq(subjectConceptOrders.userId, userId),
          eq(subjectConceptOrders.subjectId, subjectId),
          eq(subjectConceptOrders.conceptId, neighbor.conceptId)
        )
      ),
  ])
}
