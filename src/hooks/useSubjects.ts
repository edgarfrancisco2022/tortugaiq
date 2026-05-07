'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getSubjects,
  getTopics,
  getSubtopics,
  getTags,
  getSubjectSortMode,
  setSubjectSortMode,
  getSubjectConceptOrder,
  moveConceptInSubject,
} from '@/actions/subjects'
import type { Subject, Subtopic, Topic, Tag, SubjectSortMode } from '@/lib/types'

export type SubjectWithCount = Subject & { conceptCount: number }

export function useSubjects() {
  return useQuery<SubjectWithCount[]>({
    queryKey: ['subjects'],
    queryFn: () => getSubjects(),
  })
}

export function useTopics() {
  return useQuery<Topic[]>({
    queryKey: ['topics'],
    queryFn: () => getTopics(),
  })
}

export function useSubtopics() {
  return useQuery<Subtopic[]>({
    queryKey: ['subtopics'],
    queryFn: () => getSubtopics(),
  })
}

export function useTags() {
  return useQuery<Tag[]>({
    queryKey: ['tags'],
    queryFn: () => getTags(),
  })
}

export function useSubjectSortMode(subjectId: string) {
  return useQuery<SubjectSortMode>({
    queryKey: ['subject-sort-mode', subjectId],
    queryFn: () => getSubjectSortMode(subjectId),
    enabled: !!subjectId,
  })
}

export function useSetSubjectSortMode(subjectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (mode: SubjectSortMode) => setSubjectSortMode(subjectId, mode),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subject-sort-mode', subjectId] })
      qc.invalidateQueries({ queryKey: ['subject-concept-order', subjectId] })
    },
  })
}

export function useSubjectConceptOrder(subjectId: string) {
  return useQuery<string[]>({
    queryKey: ['subject-concept-order', subjectId],
    queryFn: () => getSubjectConceptOrder(subjectId),
    enabled: !!subjectId,
  })
}

export function useMoveConceptInSubject(subjectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ conceptId, direction }: { conceptId: string; direction: 'up' | 'down' }) =>
      moveConceptInSubject(subjectId, conceptId, direction),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subject-concept-order', subjectId] })
    },
  })
}
