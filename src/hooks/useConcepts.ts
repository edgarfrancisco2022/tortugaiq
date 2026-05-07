'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getConcepts,
  getConcept,
  createConcept,
  updateConcept,
  deleteConcept,
  updateConceptField,
  updateConceptContent,
  incrementReview,
  decrementReview,
} from '@/actions/concepts'
import type {
  Concept,
  ConceptInput,
  ConceptState,
  ConceptPriority,
} from '@/lib/types'

export function useConcepts() {
  return useQuery<Concept[]>({
    queryKey: ['concepts'],
    queryFn: () => getConcepts(),
  })
}

export function useConcept(id: string) {
  const qc = useQueryClient()
  return useQuery<Concept | null>({
    queryKey: ['concepts', id],
    queryFn: () => getConcept(id),
    enabled: !!id,
    // Seed from list cache so ConceptView renders immediately when navigating
    // from Library/SubjectView without waiting for a separate network fetch.
    initialData: () => {
      const list = qc.getQueryData<Concept[]>(['concepts'])
      const concept = list?.find((c) => c.id === id)
      if (!concept) return undefined
      // Resolve names from already-cached subjects/topics/tags
      const allSubjects = qc.getQueryData<{ id: string; name: string }[]>(['subjects']) ?? []
      const allTopics   = qc.getQueryData<{ id: string; name: string }[]>(['topics'])   ?? []
      const allTags     = qc.getQueryData<{ id: string; name: string }[]>(['tags'])     ?? []
      return {
        ...concept,
        subjectNames: allSubjects.filter((s) => concept.subjectIds.includes(s.id)).map((s) => s.name),
        topicName:    allTopics.find((t) => t.id === concept.topicId)?.name ?? null,
        tagNames:     allTags.filter((t) => concept.tagIds.includes(t.id)).map((t) => t.name),
      }
    },
    initialDataUpdatedAt: () => qc.getQueryState(['concepts'])?.dataUpdatedAt,
  })
}

export function useCreateConcept() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: ConceptInput) => createConcept(input),
    onSuccess: () => {
      console.log('[redirect] useCreateConcept.onSuccess — firing invalidateQueries × 4', performance.now())
      // refetchType: 'none' marks queries stale WITHOUT starting refetch network requests.
      // The default refetchType: 'active' would immediately fire Server Action calls
      // whose responses can arrive mid-transition (100-500ms later on production Neon),
      // causing TQ's useSyncExternalStore subscribers to fire high-priority React updates
      // that interrupt Next.js's startTransition-wrapped RSC navigation.
      // Stale queries will refetch automatically on next component mount or window focus.
      qc.invalidateQueries({ queryKey: ['concepts'], refetchType: 'none' })
      qc.invalidateQueries({ queryKey: ['subjects'], refetchType: 'none' })
      qc.invalidateQueries({ queryKey: ['topics'], refetchType: 'none' })
      qc.invalidateQueries({ queryKey: ['tags'], refetchType: 'none' })
      console.log('[redirect] invalidation calls dispatched', performance.now())
    },
  })
}

export function useUpdateConcept() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ConceptInput }) =>
      updateConcept(id, input),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['concepts'] })
      qc.invalidateQueries({ queryKey: ['concepts', id] })
      qc.invalidateQueries({ queryKey: ['subjects'] })
      qc.invalidateQueries({ queryKey: ['topics'] })
      qc.invalidateQueries({ queryKey: ['tags'] })
    },
  })
}

export function useDeleteConcept() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteConcept(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['concepts'] })
      qc.invalidateQueries({ queryKey: ['subjects'] })
      qc.invalidateQueries({ queryKey: ['topics'] })
      qc.invalidateQueries({ queryKey: ['tags'] })
    },
  })
}

// Optimistic update for field changes (state, priority, pinned)
export function useUpdateConceptField() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      field,
      value,
    }: {
      id: string
      field: 'state' | 'priority' | 'pinned'
      value: ConceptState | ConceptPriority | boolean
    }) => updateConceptField(id, field, value),
    onMutate: async ({ id, field, value }) => {
      await qc.cancelQueries({ queryKey: ['concepts'] })
      const prev = qc.getQueryData<Concept[]>(['concepts'])
      qc.setQueryData<Concept[]>(['concepts'], (old) =>
        old?.map((c) => (c.id === id ? { ...c, [field]: value } : c)) ?? []
      )
      return { prev }
    },
    onError: (_, __, ctx) => {
      if (ctx?.prev) qc.setQueryData(['concepts'], ctx.prev)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['concepts'] })
    },
  })
}

export function useUpdateConceptContent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      field,
      value,
    }: {
      id: string
      field: 'mvkNotes' | 'markdownNotes' | 'referencesMarkdown'
      value: string
    }) => updateConceptContent(id, field, value),
    onMutate: async ({ id, field, value }) => {
      await qc.cancelQueries({ queryKey: ['concepts'] })
      const prev = qc.getQueryData<Concept[]>(['concepts'])
      const prevSingle = qc.getQueryData<Concept | null>(['concepts', id])
      qc.setQueryData<Concept[]>(['concepts'], (old) =>
        old?.map((c) => (c.id === id ? { ...c, [field]: value } : c)) ?? []
      )
      qc.setQueryData<Concept | null>(['concepts', id], (old) =>
        old ? { ...old, [field]: value } : old
      )
      return { prev, prevSingle }
    },
    onError: (_, { id }, ctx) => {
      if (ctx?.prev) qc.setQueryData(['concepts'], ctx.prev)
      if (ctx?.prevSingle !== undefined) qc.setQueryData(['concepts', id], ctx.prevSingle)
    },
    onSettled: (_, __, { id }) => {
      // refetchType: 'none' marks stale without an immediate network refetch.
      // Avoids the startTransition race that can drop RSC navigation mid-flight.
      // See markdown-editor-redirect-on-save.md Attempt 2 and
      // redirect-new-concept-navigation.md Attempt 9.
      qc.invalidateQueries({ queryKey: ['concepts', id], refetchType: 'none' })
    },
  })
}

// Optimistic update for review increment
export function useIncrementReview() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => incrementReview(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['concepts'] })
      const prev = qc.getQueryData<Concept[]>(['concepts'])
      qc.setQueryData<Concept[]>(['concepts'], (old) =>
        old?.map((c) => (c.id === id ? { ...c, reviewCount: (c.reviewCount ?? 0) + 1 } : c)) ?? []
      )
      return { prev }
    },
    onError: (_, __, ctx) => {
      if (ctx?.prev) qc.setQueryData(['concepts'], ctx.prev)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['concepts'] })
    },
  })
}

// Optimistic update for review decrement
export function useDecrementReview() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => decrementReview(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['concepts'] })
      const prev = qc.getQueryData<Concept[]>(['concepts'])
      qc.setQueryData<Concept[]>(['concepts'], (old) =>
        old?.map((c) =>
          c.id === id ? { ...c, reviewCount: Math.max(0, (c.reviewCount ?? 0) - 1) } : c
        ) ?? []
      )
      return { prev }
    },
    onError: (_, __, ctx) => {
      if (ctx?.prev) qc.setQueryData(['concepts'], ctx.prev)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['concepts'] })
    },
  })
}
