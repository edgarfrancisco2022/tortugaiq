'use client'

import { useEffect, useLayoutEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { useConcept, useUpdateConceptField, useUpdateConceptContent, useIncrementReview, useDecrementReview } from '@/hooks/useConcepts'
import { useConceptForm } from '@/components/providers/ConceptFormProvider'
import { useDirtyState } from '@/components/providers/DirtyStateProvider'
import ConceptLoading from './loading'
import MarkdownEditor, { MVK_GUIDANCE_DISPLAY, MVK_EDIT_PLACEHOLDER } from '@/components/ui/MarkdownEditor'
import { StateSelector, PriorityBadge, ReviewCounter, PinButton } from '@/components/ui/StatusBadge'
import ShortcutsHintBar from '@/components/ui/ShortcutsHintBar'

const getMain = () => document.getElementById('main-content')

export default function ConceptView() {
  const { conceptId } = useParams<{ conceptId: string }>()
  const router = useRouter()
  const { openConceptForm, closeConceptForm } = useConceptForm()
  const { requestNavigation } = useDirtyState()

  const qc = useQueryClient()
  const { data: concept, isLoading } = useConcept(conceptId)
  const updateFieldMut = useUpdateConceptField()
  const updateContentMut = useUpdateConceptContent()
  const incrementMut = useIncrementReview()
  const decrementMut = useDecrementReview()

  // Drop the navigation backdrop (from ConceptFormProvider) now that this page is rendered.
  // Also refetch subjects here — RSC navigation is done so there's no startTransition race.
  // useCreateConcept.onSuccess uses refetchType:'none' to avoid the race, so subjects stay
  // stale until we trigger the refetch explicitly once navigation has settled.
  useEffect(() => {
    console.log('[redirect] ConceptView mounted — calling closeConceptForm', performance.now(), { conceptId })
    closeConceptForm()
    qc.invalidateQueries({ queryKey: ['subjects'] })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conceptId])

  // Always scroll to top when navigating to a concept
  useEffect(() => {
    const el = getMain()
    if (el) el.scrollTop = 0
  }, [conceptId])

  // Keyboard shortcuts: Backspace = back, +/- = review counter
  // useLayoutEffect (not useEffect) is intentional: layout effects re-register synchronously
  // after React commits, before the browser paints and before any new browser events can fire.
  // useEffect defers until after paint — leaving a window where the browser can fire a held
  // Backspace key-repeat on document.body with the old (stale) listener closure that has
  // isPending=false, bypassing the isPending guard and causing an unintended router.back().
  useLayoutEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.contentEditable === 'true') return
      // Don't navigate while a content save is in-flight. Belt-and-suspenders guard
      // against stale Backspace keydown events that fire after the textarea unmounts
      // (e.g. user held Backspace while clicking Save).
      if (updateContentMut.isPending) return
      if (e.key === 'Backspace') {
        e.preventDefault()
        requestNavigation(() => {
          ;(window as any).__cvBackPending = true
          sessionStorage.setItem('cv-back', '1')
          router.back()
        })
      } else if (e.key === '+' || e.key === '=') {
        incrementMut.mutate(conceptId)
      } else if (e.key === '-') {
        decrementMut.mutate(conceptId)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conceptId, router, requestNavigation, updateContentMut.isPending])  // useLayoutEffect dep array

  if (isLoading) {
    return <ConceptLoading />
  }

  if (!concept) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-400">Concept not found.</p>
      </div>
    )
  }

  function handleBack() {
    requestNavigation(() => {
      ;(window as any).__cvBackPending = true
      sessionStorage.setItem('cv-back', '1')
      router.back()
    })
  }

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 py-10">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={handleBack}
          className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700 transition-colors group"
        >
          <span className="group-hover:-translate-x-0.5 transition-transform inline-block">←</span>
          Back
        </button>
        <button
          onClick={() => openConceptForm(concept)}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-blue-600 transition-colors"
        >
          <span>✎</span> Edit
        </button>
      </div>

      <h1 className="font-inter text-3xl font-bold text-gray-900 mb-6 tracking-tight">{concept.name}</h1>

      {/* Metadata */}
      <div className="bg-gray-50 border border-gray-100 rounded-xl p-5 mb-3">
        <div className="space-y-2 mb-4">
          {concept.subjectName && (
            <MetaRow label="Subject">
              <Chip cls="bg-blue-100 text-blue-700">{concept.subjectName}</Chip>
            </MetaRow>
          )}
          <MetaRow label="Topic">
            {concept.topicName
              ? <Chip cls="bg-blue-50 text-blue-700">{concept.topicName}</Chip>
              : <span className="text-xs text-gray-300 italic">None</span>
            }
          </MetaRow>
          <MetaRow label="Subtopic">
            {concept.subtopicName
              ? <Chip cls="bg-violet-50 text-violet-700">{concept.subtopicName}</Chip>
              : <span className="text-xs text-gray-300 italic">None</span>
            }
          </MetaRow>
          <MetaRow label="Tags">
            {concept.tagNames && concept.tagNames.length > 0
              ? concept.tagNames.map((name) => (
                  <Chip key={name} cls="bg-gray-200 text-gray-600">#{name}</Chip>
                ))
              : <span className="text-xs text-gray-300 italic">None</span>
            }
          </MetaRow>
        </div>

        <div className="pt-3 border-t border-gray-200 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400">State</span>
            <StateSelector
              value={concept.state}
              onChange={(v) => updateFieldMut.mutate({ id: conceptId, field: 'state', value: v })}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400">Priority</span>
            <PriorityBadge
              value={concept.priority}
              onChange={(v) => updateFieldMut.mutate({ id: conceptId, field: 'priority', value: v })}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400">Reviews</span>
            <ReviewCounter
              count={concept.reviewCount}
              onIncrement={() => incrementMut.mutate(conceptId)}
              onDecrement={() => decrementMut.mutate(conceptId)}
            />
          </div>
          <PinButton
            pinned={concept.pinned}
            onToggle={() => updateFieldMut.mutate({ id: conceptId, field: 'pinned', value: !concept.pinned })}
          />
        </div>
      </div>

      <ShortcutsHintBar items={[
        { keyLabel: '⌫', actionLabel: 'Back' },
        { keyLabel: '+ / −', actionLabel: 'Review Count' },
      ]} className="mb-8" />

      {/* Content sections */}
      <section className="mb-8 bg-blue-50 border border-blue-100 rounded-xl p-4">
        <h2 className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-3">MVK — Minimum Viable Knowledge</h2>
        <MarkdownEditor
          key={`${conceptId}-mvk`}
          content={concept.mvkNotes ?? ''}
          hint={MVK_GUIDANCE_DISPLAY}
          editPlaceholder={MVK_EDIT_PLACEHOLDER}
          onSave={(value) => updateContentMut.mutate({ id: conceptId, field: 'mvkNotes', value })}
        />
      </section>

      <Section title="Notes">
        <MarkdownEditor
          key={`${conceptId}-notes`}
          content={concept.markdownNotes ?? ''}
          placeholder="Add meaningful notes, interesting intuitions, or hard-won insights you may want to revisit later..."
          onSave={(value) => updateContentMut.mutate({ id: conceptId, field: 'markdownNotes', value })}
        />
      </Section>

      <Section title="References">
        <MarkdownEditor
          key={`${conceptId}-refs`}
          content={concept.referencesMarkdown ?? ''}
          placeholder="Add URLs, book references, page numbers, or any source material..."
          onSave={(value) => updateContentMut.mutate({ id: conceptId, field: 'referencesMarkdown', value })}
        />
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{title}</h2>
      {children}
    </section>
  )
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide w-14 pt-0.5 flex-shrink-0">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  )
}

function Chip({ children, cls }: { children: React.ReactNode; cls: string }) {
  return <span className={`text-xs px-2 py-0.5 rounded-full ${cls}`}>{children}</span>
}
