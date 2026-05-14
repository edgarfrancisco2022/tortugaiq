'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useConcepts, useUpdateConceptField, useUpdateConceptContent, useIncrementReview, useDecrementReview } from '@/hooks/useConcepts'
import { useSubjects, useTopics, useSubtopics, useTags } from '@/hooks/useSubjects'
import { useFilterSort } from '@/hooks/useFilterSort'
import { useViewStateRegistry } from '@/components/providers/ViewStateRegistryProvider'
import FilterSortBar from '@/components/ui/FilterSortBar'
import ShortcutsHintBar from '@/components/ui/ShortcutsHintBar'
import { StateSelector, PriorityBadge, ReviewCounter, PinButton, PinIcon } from '@/components/ui/StatusBadge'
import MarkdownEditor, { MVK_GUIDANCE_DISPLAY, MVK_EDIT_PLACEHOLDER } from '@/components/ui/MarkdownEditor'
import type { FilterState } from '@/hooks/useFilterSort'

const SCROLL_KEY = 'scroll-focus'
const STATE_KEY  = 'focus-view-state'
const getMain = () => document.getElementById('main-content')

function isEditableTarget(e: KeyboardEvent) {
  const t = e.target as HTMLElement
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.contentEditable === 'true'
}

// useSearchParams() requires a Suspense boundary in Next.js App Router.
// The default export wraps FocusMode in Suspense.
export default function FocusModePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full"><p className="text-gray-400 text-sm">Loading…</p></div>}>
      <FocusMode />
    </Suspense>
  )
}

function FocusMode() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const { data: allConcepts = [], isLoading: conceptsLoading } = useConcepts()
  const { data: subjects = [] } = useSubjects()
  const { data: topics = [] } = useTopics()
  const { data: subtopics = [] } = useSubtopics()
  const { data: tags = [] } = useTags()
  const updateFieldMut = useUpdateConceptField()
  const updateContentMut = useUpdateConceptContent()
  const incrementMut = useIncrementReview()
  const decrementMut = useDecrementReview()

  const { registerViewStateSaver } = useViewStateRegistry()

  // Restore filter/sort state if returning from ConceptView (read before first render).
  // Guard with __cvBackPending so a stale cv-back entry (after a hard refresh or
  // cache-served back-nav) never incorrectly initialises filters from an old session.
  const [savedState] = useState<{ filters: FilterState; sort: string } | null>(() => {
    if (typeof window === 'undefined') return null
    if (!sessionStorage.getItem('cv-back')) return null
    if (!(window as any).__cvBackPending) return null
    try { return JSON.parse(sessionStorage.getItem(STATE_KEY) || 'null') } catch { return null }
  })

  const { filtered, filters, sort, setFilter, setSort: setSortRaw, clearFilters, hasActiveFilters } =
    useFilterSort(allConcepts, { initialFilters: savedState?.filters, initialSort: savedState?.sort })

  // Only one section active at a time: null | 'mvk' | 'notes' | 'references'
  const [activeSection, setActiveSection] = useState<'mvk' | 'notes' | 'references' | null>(null)

  // currentIndex is local state — the authoritative position in the filtered list.
  // Using local state (instead of deriving from the URL param) means setSort() and
  // setCurrentIndex(0) are batched in one React render, so there is no flash of a
  // wrong position number when the sort option changes.
  const [currentIndex, setCurrentIndex] = useState(0)
  const backRestoring = useRef(false)

  // On first data load, restore position from the URL ?id= param (back-navigation only).
  // On a fresh page load / refresh, ignore the param and reset to index 0.
  // Also check __cvBackPending so a stale cv-back entry (e.g. from a prior
  // cache-served back-nav) doesn't trigger false restoration on a fresh mount.
  const currentId = searchParams.get('id')
  const initializedFromUrlRef = useRef(false)
  useEffect(() => {
    if (!initializedFromUrlRef.current && filtered.length > 0) {
      initializedFromUrlRef.current = true
      const isBackNav =
        typeof window !== 'undefined' &&
        !!sessionStorage.getItem('cv-back') &&
        !!(window as any).__cvBackPending
      if (isBackNav && currentId) {
        const idx = filtered.findIndex((c) => c.id === currentId)
        if (idx > 0) {
          backRestoring.current = true
          setCurrentIndex(idx)
        }
      } else if (currentId) {
        // Fresh load — strip the stale ?id= param so the URL matches index 0
        router.replace('/app/focus')
      }
    }
  }, [filtered, currentId, router])

  // Reset to first element whenever the filtered list changes (filter or sort change).
  // Skips on initial render and back-navigation restoration.
  const isFirstRenderFilter = useRef(true)
  useEffect(() => {
    if (isFirstRenderFilter.current) { isFirstRenderFilter.current = false; return }
    if (backRestoring.current) { backRestoring.current = false; return }
    setCurrentIndex(0)
  }, [filtered])

  // Clamp to a valid index when the filtered list shrinks (e.g. after adding a filter).
  const safeIndex = filtered.length === 0 ? 0 : Math.min(currentIndex, filtered.length - 1)

  const concept = filtered[safeIndex] ?? null
  const conceptSubject = concept ? subjects.find((s) => s.id === concept.subjectId) : null

  // Registry ref: inline assignment keeps closure fresh every render.
  const saveStateForRegistryRef = useRef<() => void>(() => {})
  saveStateForRegistryRef.current = () => {
    sessionStorage.setItem(STATE_KEY, JSON.stringify({ filters, sort }))
    const el = getMain()
    if (el) sessionStorage.setItem(SCROLL_KEY, String(el.scrollTop))
  }

  useEffect(() => {
    return registerViewStateSaver(() => saveStateForRegistryRef.current())
  }, [registerViewStateSaver])

  // Scroll to top on mount; restore scroll if returning from ConceptView.
  // Uses window.__cvBackPending (in-memory, resets on page load) to distinguish a
  // genuine back-navigation from a stale cv-back entry left when the router cache
  // served the previous view without remounting it.
  useEffect(() => {
    const el = getMain()
    if (el) el.scrollTop = 0

    if (sessionStorage.getItem('cv-back')) {
      const isGenuineBackNav = !!(window as any).__cvBackPending
      ;(window as any).__cvBackPending = false

      sessionStorage.removeItem('cv-back')
      sessionStorage.removeItem(STATE_KEY)

      if (!isGenuineBackNav) {
        // Stale cv-back — discard saved scroll and start fresh.
        sessionStorage.removeItem(SCROLL_KEY)
        return
      }

      const saved = sessionStorage.getItem(SCROLL_KEY)
      sessionStorage.removeItem(SCROLL_KEY)
      if (saved) {
        const pos = parseInt(saved, 10)
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const el2 = getMain()
            if (el2) el2.scrollTop = pos
          })
        })
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function goTo(idx: number) {
    const c = filtered[idx]
    if (!c) return
    setActiveSection(null)
    setCurrentIndex(idx)
    const params = new URLSearchParams({ id: c.id })
    router.replace(`/app/focus?${params.toString()}`)
  }

  // Changing sort resets position to the first element of the newly sorted list.
  // setSortRaw + setCurrentIndex(0) are batched together by React 18 — single render,
  // no intermediate flash of a wrong position number.
  function setSort(newSort: string) {
    setSortRaw(newSort)
    setCurrentIndex(0)
  }

  function toggleSection(section: 'mvk' | 'notes' | 'references') {
    setActiveSection((prev) => (prev === section ? null : section))
  }

  // stateRef is updated every render so the keyboard handler (registered once) always
  // reads current values. Crucially, goTo is included here — if it were captured only
  // at mount time it would close over the initial (possibly empty or partial) filtered
  // list, causing arrow-key navigation to stop working after data loads or sort changes.
  const stateRef = useRef({ filtered, currentIndex: safeIndex, filters, sort, goTo })
  stateRef.current = { filtered, currentIndex: safeIndex, filters, sort, goTo }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isEditableTarget(e)) return
      const { filtered, currentIndex, filters, sort, goTo } = stateRef.current
      if (!filtered.length) return

      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        if (currentIndex > 0) goTo(currentIndex - 1)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        if (currentIndex < filtered.length - 1) goTo(currentIndex + 1)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const c = filtered[currentIndex]
        if (c) {
          sessionStorage.setItem(STATE_KEY, JSON.stringify({ filters, sort }))
          const el = getMain()
          if (el) sessionStorage.setItem(SCROLL_KEY, String(el.scrollTop))
          router.push(`/app/concepts/${c.id}`)
        }
      } else if (e.key === '+' || e.key === '=') {
        const c = filtered[currentIndex]
        if (c) incrementMut.mutate(c.id)
      } else if (e.key === '-') {
        const c = filtered[currentIndex]
        if (c) decrementMut.mutate(c.id)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function saveState() {
    sessionStorage.setItem(STATE_KEY, JSON.stringify({ filters, sort }))
    const el = getMain()
    if (el) sessionStorage.setItem(SCROLL_KEY, String(el.scrollTop))
  }

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 py-10">
      <div className="flex items-baseline justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Focus</h1>
        <span className="text-sm text-gray-400">{filtered.length} total</span>
      </div>

      <FilterSortBar
        filters={filters}
        sort={sort}
        setFilter={setFilter}
        setSort={setSort}
        clearFilters={clearFilters}
        hasActiveFilters={hasActiveFilters}
        subjects={subjects}
        topics={topics}
        subtopics={subtopics}
        tags={tags}
        resultCount={filtered.length}
      />

      <ShortcutsHintBar items={[
        { keyLabel: '← →', actionLabel: 'Navigate' },
        { keyLabel: 'Enter', actionLabel: 'Open' },
        { keyLabel: '+ / −', actionLabel: 'Review Count' },
      ]} />

      {conceptsLoading ? (
        <div className="text-center py-20 text-gray-400 text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400 text-sm">
          {allConcepts.length === 0 ? 'No concepts yet. Create your first concept to get started.' : 'No concepts match the current filters.'}
        </div>
      ) : (
        <>
          {/* Navigation */}
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => goTo(safeIndex - 1)}
              disabled={safeIndex === 0}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600 disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              ← Prev
            </button>
            <span className="text-sm text-gray-400">
              {safeIndex + 1} / {filtered.length}
            </span>
            <button
              onClick={() => goTo(safeIndex + 1)}
              disabled={safeIndex === filtered.length - 1}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600 disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              Next →
            </button>
          </div>

          {concept && (
            <div className="bg-white border border-gray-200 rounded-2xl p-4 md:p-8 shadow-sm">
              {/* Concept name + link */}
              <div className="flex items-start justify-between mb-2">
                <h2 className="font-inter flex-1 min-w-0 text-2xl font-bold text-gray-900 leading-tight tracking-tight break-words">
                  {concept.pinned && <PinIcon size={14} className="inline text-amber-400 mr-2 -mt-0.5" />}
                  {concept.name}
                </h2>
                <Link
                  href={`/app/concepts/${concept.id}`}
                  onClick={saveState}
                  className="text-xs text-gray-400 hover:text-blue-600 ml-4 flex-shrink-0 mt-1"
                  title="Open full concept page"
                >
                  Open →
                </Link>
              </div>

              {/* Subject badge */}
              {conceptSubject && (
                <div className="flex flex-wrap gap-1.5 mb-5">
                  <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
                    {conceptSubject.name}
                  </span>
                </div>
              )}

              {/* Controls */}
              <div className="flex flex-wrap items-center gap-3 pb-5 border-b border-gray-100 mb-5">
                <StateSelector
                  value={concept.state}
                  onChange={(v) => updateFieldMut.mutate({ id: concept.id, field: 'state', value: v })}
                />
                <PriorityBadge
                  value={concept.priority}
                  onChange={(v) => updateFieldMut.mutate({ id: concept.id, field: 'priority', value: v })}
                />
                <ReviewCounter
                  count={concept.reviewCount}
                  onIncrement={() => incrementMut.mutate(concept.id)}
                  onDecrement={() => decrementMut.mutate(concept.id)}
                />
                <PinButton
                  pinned={concept.pinned}
                  onToggle={() => updateFieldMut.mutate({ id: concept.id, field: 'pinned', value: !concept.pinned })}
                />
              </div>

              {/* Reveal buttons */}
              <div className="flex flex-wrap gap-3">
                <RevealButton
                  label="Show MVK"
                  hideLabel="Hide MVK"
                  visible={activeSection === 'mvk'}
                  onToggle={() => toggleSection('mvk')}
                />
                <RevealButton
                  label="Show Notes"
                  hideLabel="Hide Notes"
                  visible={activeSection === 'notes'}
                  onToggle={() => toggleSection('notes')}
                />
                <RevealButton
                  label="Show References"
                  hideLabel="Hide References"
                  visible={activeSection === 'references'}
                  onToggle={() => toggleSection('references')}
                />
              </div>

              {activeSection === 'mvk' && (
                <RevealSection title="MVK">
                  <MarkdownEditor
                    content={concept.mvkNotes ?? ''}
                    hint={MVK_GUIDANCE_DISPLAY}
                    editPlaceholder={MVK_EDIT_PLACEHOLDER}
                    onSave={(value) => updateContentMut.mutate({ id: concept.id, field: 'mvkNotes', value })}
                  />
                </RevealSection>
              )}

              {activeSection === 'notes' && (
                <RevealSection title="Notes">
                  <MarkdownEditor
                    content={concept.markdownNotes ?? ''}
                    placeholder="Add meaningful notes, interesting intuitions, or hard-won insights you may want to revisit later..."
                    onSave={(value) => updateContentMut.mutate({ id: concept.id, field: 'markdownNotes', value })}
                  />
                </RevealSection>
              )}

              {activeSection === 'references' && (
                <RevealSection title="References">
                  <MarkdownEditor
                    content={concept.referencesMarkdown ?? ''}
                    placeholder="Add URLs, book references, page numbers, or any source material..."
                    onSave={(value) => updateContentMut.mutate({ id: concept.id, field: 'referencesMarkdown', value })}
                  />
                </RevealSection>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function RevealButton({
  label,
  hideLabel,
  visible,
  onToggle,
}: {
  label: string
  hideLabel: string
  visible: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      className={`text-sm px-4 py-1.5 rounded-lg border font-medium transition-colors ${
        visible
          ? 'bg-blue-50 border-blue-200 text-blue-700'
          : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:text-gray-800'
      }`}
    >
      {visible ? hideLabel : label}
    </button>
  )
}

function RevealSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5 pt-5 border-t border-gray-100">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{title}</p>
      <div>{children}</div>
    </div>
  )
}
