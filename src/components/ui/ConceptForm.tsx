'use client'

import { useState, useEffect, useRef } from 'react'
import CreatableMultiSelect, { type CreatableMultiSelectHandle } from './CreatableMultiSelect'
import { useSubjects, useTopics, useSubtopics, useTags } from '@/hooks/useSubjects'
import { useCreateConcept, useUpdateConcept } from '@/hooks/useConcepts'
import type { Concept } from '@/lib/types'

interface Props {
  concept?: Concept | null
  onClose: () => void
  onDone: (id: string) => void
}

/**
 * Handles both Add (concept=null) and Edit (concept=existing) modes.
 * In edit mode, resolves IDs → names using the subjects/topics/subtopics/tags queries.
 */
export default function ConceptForm({ concept = null, onClose, onDone }: Props) {
  const isEdit = Boolean(concept)

  const { data: allSubjects = [] } = useSubjects()
  const { data: allTopics = [] } = useTopics()
  const { data: allSubtopics = [] } = useSubtopics()
  const { data: allTags = [] } = useTags()

  const createMutation = useCreateConcept()
  const updateMutation = useUpdateConcept()

  // Resolve IDs → names for pre-population in edit mode
  const initSubjects = isEdit
    ? allSubjects.filter((s) => concept!.subjectIds.includes(s.id)).map((s) => s.name)
    : []
  const initTopic: string | null = isEdit && concept!.topicId
    ? allTopics.find((t) => t.id === concept!.topicId)?.name ?? null
    : null
  const initSubtopic: string | null = isEdit && concept!.subtopicId
    ? allSubtopics.find((t) => t.id === concept!.subtopicId)?.name ?? null
    : null
  const initTags = isEdit
    ? allTags.filter((t) => concept!.tagIds.includes(t.id)).map((t) => t.name)
    : []

  const [name, setName] = useState(isEdit ? concept!.name : '')
  const [selSubjects, setSelSubjects] = useState<string[]>(initSubjects)
  const [selTopic, setSelTopic] = useState<string | null>(initTopic)
  const [selSubtopic, setSelSubtopic] = useState<string | null>(initSubtopic)
  const [selTags, setSelTags] = useState<string[]>(initTags)
  const [error, setError] = useState('')

  const [viewport, setViewport] = useState(() => ({
    height: window.visualViewport?.height ?? window.innerHeight,
    offsetTop: window.visualViewport?.offsetTop ?? 0,
  }))

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => setViewport({ height: vv.height, offsetTop: vv.offsetTop })
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])

  const pending = createMutation.isPending || updateMutation.isPending
  const backdropMouseDownRef = useRef(false)
  const topicRef    = useRef<CreatableMultiSelectHandle>(null)
  const subtopicRef = useRef<CreatableMultiSelectHandle>(null)
  const tagsRef     = useRef<CreatableMultiSelectHandle>(null)
  const cancelRef   = useRef<HTMLButtonElement>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError('Concept name is required.')
      return
    }
    if (selSubjects.length === 0) {
      setError('At least one subject is required.')
      return
    }

    const input = {
      name: name.trim(),
      subjectNames: selSubjects,
      topicName: selTopic,
      subtopicName: selSubtopic,
      tagNames: selTags,
    }

    if (isEdit) {
      updateMutation.mutate(
        { id: concept!.id, input },
        {
          onSuccess: () => onDone(concept!.id),
          onError: () => setError('Failed to update concept.'),
        }
      )
    } else {
      try {
        const id = await createMutation.mutateAsync(input)
        onDone(id)
      } catch {
        setError('Failed to create concept.')
      }
    }
  }

  return (
    <div
      className="fixed inset-x-0 bg-black/50 flex items-center justify-center z-50 p-4"
      style={{ top: viewport.offsetTop, height: viewport.height }}
      onMouseDown={(e) => { backdropMouseDownRef.current = e.target === e.currentTarget }}
      onMouseUp={(e) => { if (!pending && backdropMouseDownRef.current && e.target === e.currentTarget) onClose() }}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col"
        style={{ maxHeight: viewport.height - 32 }}
        onKeyDown={(e) => { if (e.key === 'Escape' && !pending) onClose() }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-sm font-semibold text-gray-900 tracking-tight">
            {isEdit ? 'Edit Concept' : 'New Concept'}
          </h2>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Close"
          >
            <svg
              viewBox="0 0 14 14"
              fill="none"
              className="w-3 h-3"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M2 2l10 10M12 2L2 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 overflow-y-auto overscroll-none">
          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Concept Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Photosynthesis"
                className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white transition-colors hover:border-gray-400 focus:outline-none focus:border-blue-500"
                autoFocus
              />
            </div>

            <CreatableMultiSelect
              label="Subject"
              required
              options={allSubjects.map((s) => s.name)}
              selected={selSubjects}
              onChange={setSelSubjects}
              placeholder="Select or create subject..."
              onTabNext={() => topicRef.current?.focus()}
            />

            <CreatableMultiSelect
              ref={topicRef}
              label="Topic"
              single
              options={allTopics.map((t) => t.name)}
              selected={selTopic ? [selTopic] : []}
              onChange={(arr) => setSelTopic(arr[arr.length - 1] ?? null)}
              placeholder="Select or create topic..."
              onTabNext={() => subtopicRef.current?.focus()}
            />

            <CreatableMultiSelect
              ref={subtopicRef}
              label="Subtopic"
              single
              options={allSubtopics.map((t) => t.name)}
              selected={selSubtopic ? [selSubtopic] : []}
              onChange={(arr) => setSelSubtopic(arr[arr.length - 1] ?? null)}
              placeholder="Select or create subtopic..."
              onTabNext={() => tagsRef.current?.focus()}
            />

            <CreatableMultiSelect
              ref={tagsRef}
              label="Tags"
              options={allTags.map((t) => t.name)}
              selected={selTags}
              onChange={setSelTags}
              placeholder="Select or create tag..."
              onTabNext={() => cancelRef.current?.focus()}
            />

            {error && <p className="text-red-500 text-xs">{error}</p>}

            <div className="flex gap-2 pt-1">
              <button
                ref={cancelRef}
                type="button"
                onClick={onClose}
                disabled={pending}
                className="flex-1 border border-gray-300 text-gray-700 rounded-md py-1.5 text-sm font-medium hover:bg-gray-50 hover:border-gray-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending}
                className="flex-1 bg-blue-600 text-white rounded-md py-1.5 text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {pending ? '…' : isEdit ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
