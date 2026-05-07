'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useConcepts, useUpdateConceptField, useUpdateConceptContent, useIncrementReview, useDecrementReview, useDeleteConcept } from '@/hooks/useConcepts'
import { useSubjects, useTopics, useSubtopics, useTags } from '@/hooks/useSubjects'
import { useSidebarState } from '@/components/providers/SidebarStateProvider'
import { useFilterSort } from '@/hooks/useFilterSort'
import { useViewStateRegistry } from '@/components/providers/ViewStateRegistryProvider'
import FilterSortBar from '@/components/ui/FilterSortBar'
import ShortcutsHintBar from '@/components/ui/ShortcutsHintBar'
import { StateSelector, PriorityBadge, ReviewCounter, PinButton, PinIcon } from '@/components/ui/StatusBadge'
import MvkDrawer from '@/components/ui/MvkDrawer'
import DeleteConceptDialog from '@/components/ui/DeleteConceptDialog'
import type { FilterState } from '@/hooks/useFilterSort'
import type { Concept, ConceptState, ConceptPriority } from '@/lib/types'

const SCROLL_KEY  = 'scroll-list'
const LAST_ID_KEY = 'list-last-id'
const STATE_KEY   = 'list-view-state'
const getMain = () => document.getElementById('main-content')

function isEditableTarget(e: KeyboardEvent) {
  const t = e.target as HTMLElement
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.contentEditable === 'true'
}

function nameFiltered(concepts: Concept[], query: string) {
  if (!query) return concepts
  const q = query.toLowerCase()
  return concepts.filter((c) => c.name.toLowerCase().includes(q))
}

function getNextFocusId(list: Concept[], deletedIdx: number): string | null {
  if (list.length <= 1) return null
  if (deletedIdx < 0) return list[0]?.id ?? null
  const nextIdx = deletedIdx < list.length - 1 ? deletedIdx + 1 : deletedIdx - 1
  return list[nextIdx]?.id ?? null
}

export default function ListMode() {
  const router = useRouter()
  const { collapsed } = useSidebarState()
  const { registerViewStateSaver } = useViewStateRegistry()

  const { data: allConcepts = [] } = useConcepts()
  const { data: subjects = [] } = useSubjects()
  const { data: topics = [] } = useTopics()
  const { data: subtopics = [] } = useSubtopics()
  const { data: tags = [] } = useTags()
  const updateFieldMut = useUpdateConceptField()
  const updateContentMut = useUpdateConceptContent()
  const incrementMut = useIncrementReview()
  const decrementMut = useDecrementReview()
  const deleteMut = useDeleteConcept()

  // Restore filter/sort state if returning from ConceptView (read before first render).
  // Guard with __cvBackPending (in-memory, resets on page load) so a stale cv-back
  // entry in sessionStorage (e.g. after a hard refresh or cache-served back-nav) never
  // incorrectly initialises filters from an old session.
  const [savedState] = useState<{ filters: FilterState; sort: string } | null>(() => {
    if (typeof window === 'undefined') return null
    if (!sessionStorage.getItem('cv-back')) return null
    if (!(window as any).__cvBackPending) return null
    try { return JSON.parse(sessionStorage.getItem(STATE_KEY) || 'null') } catch { return null }
  })

  const [nameQuery, setNameQuery] = useState('')
  const { filtered, filters, sort, setFilter, setSort, clearFilters, hasActiveFilters } =
    useFilterSort(allConcepts, { initialFilters: savedState?.filters, initialSort: savedState?.sort })

  const results = useMemo(
    () => nameFiltered(filtered, nameQuery),
    [filtered, nameQuery]
  )

  // Track focus by concept ID so that sort-order changes (e.g. reviews_high/low
  // resorting after a reviewCount update) never reset focus to index 0. The
  // derived focusedIdx always reflects the concept's current position.
  const [focusedConceptId, setFocusedConceptId] = useState<string | null>(null)
  const focusedConceptIdRef = useRef<string | null>(null)
  focusedConceptIdRef.current = focusedConceptId
  const pendingFocusIdRef = useRef<string | null | undefined>(undefined)
  const focusedIdx = useMemo(() => {
    if (!focusedConceptId) return 0
    const idx = results.findIndex((c) => c.id === focusedConceptId)
    return idx >= 0 ? idx : 0
  }, [results, focusedConceptId])

  const [panelOpen, setPanelOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Concept | null>(null)
  const focusedConcept = results[focusedIdx] ?? null

  // Registry ref: inline assignment (not useEffect) keeps closure fresh every render,
  // matching the stateRef pattern used by keyboard handlers throughout this file.
  const saveStateForRegistryRef = useRef<() => void>(() => {})
  saveStateForRegistryRef.current = () => {
    sessionStorage.setItem(STATE_KEY, JSON.stringify({ filters, sort }))
    const el = getMain()
    if (el) sessionStorage.setItem(SCROLL_KEY, String(el.scrollTop))
    const id = results[focusedIdx]?.id
    if (id) sessionStorage.setItem(LAST_ID_KEY, id)
  }

  useEffect(() => {
    return registerViewStateSaver(() => saveStateForRegistryRef.current())
  }, [registerViewStateSaver])

  const suppressScroll = useRef(false)
  const backRestoring = useRef(false)

  // Scroll to top on mount; restore scroll/focus if returning from ConceptView.
  // Uses window.__cvBackPending (in-memory flag, resets on page load) alongside
  // the sessionStorage cv-back entry to distinguish a genuine back-navigation from
  // a stale entry left behind when the router cache served the previous view without
  // remounting it (in which case this component mounts fresh later, e.g. via sidebar).
  useEffect(() => {
    const el = getMain()
    if (el) el.scrollTop = 0

    if (sessionStorage.getItem('cv-back')) {
      const isGenuineBackNav = !!(window as any).__cvBackPending
      ;(window as any).__cvBackPending = false

      sessionStorage.removeItem('cv-back')
      sessionStorage.removeItem(STATE_KEY)

      if (!isGenuineBackNav) {
        // Stale cv-back (page refresh, cache-served nav, or sidebar arrival) —
        // discard the saved keys and start fresh.
        sessionStorage.removeItem(SCROLL_KEY)
        sessionStorage.removeItem(LAST_ID_KEY)
        return
      }

      const saved = sessionStorage.getItem(SCROLL_KEY)
      sessionStorage.removeItem(SCROLL_KEY)
      const lastId = sessionStorage.getItem(LAST_ID_KEY)
      sessionStorage.removeItem(LAST_ID_KEY)

      backRestoring.current = true
      const idx = lastId ? results.findIndex((c) => c.id === lastId) : -1
      if (idx >= 0) setFocusedConceptId(lastId!)

      if (saved) {
        suppressScroll.current = true
        const pos = parseInt(saved, 10)
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const el2 = getMain()
            if (el2) el2.scrollTop = pos
            suppressScroll.current = false
          })
        })
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reset focus to first item when the visible concept set changes (filter/search/sort change).
  // If the previously focused concept is still visible (e.g. sort-order changed due to a
  // reviewCount update), we skip the reset — focusedIdx auto-recalculates via useMemo.
  const resultsKey = results.map((c) => c.id).join(',')
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    if (backRestoring.current) { backRestoring.current = false; return }
    const prevId = focusedConceptIdRef.current
    if (prevId && results.some((c) => c.id === prevId)) return
    if (pendingFocusIdRef.current !== undefined) {
      const target = pendingFocusIdRef.current
      pendingFocusIdRef.current = undefined
      setFocusedConceptId(target)
      return
    }
    setFocusedConceptId(results[0]?.id ?? null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultsKey])

  // Scroll focused row into view — fires only when focus explicitly changes (keyboard
  // nav, row click, back-nav restore), NOT on every data re-render. This prevents the
  // active row from being pulled back into view when the user scrolls away and then
  // clicks +/− on a different concept row.
  useEffect(() => {
    if (suppressScroll.current) return
    const concept = results[focusedIdx]
    if (!concept) return
    const el = document.getElementById(`lib-${concept.id}`)
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'instant' })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedConceptId])

  // Keyboard navigation
  const stateRef = useRef({ results, focusedIdx, filters, sort })
  stateRef.current = { results, focusedIdx, filters, sort }
  const lastNavTime = useRef(0)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isEditableTarget(e)) return
      const { results, focusedIdx, filters, sort } = stateRef.current
      if (!results.length) return

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        const now = Date.now()
        if (e.repeat && now - lastNavTime.current < 180) return
        lastNavTime.current = now
        const newIdx = Math.min(focusedIdx + 1, results.length - 1)
        setFocusedConceptId(results[newIdx]?.id ?? null)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        const now = Date.now()
        if (e.repeat && now - lastNavTime.current < 180) return
        lastNavTime.current = now
        const newIdx = Math.max(focusedIdx - 1, 0)
        setFocusedConceptId(results[newIdx]?.id ?? null)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const concept = results[focusedIdx]
        if (concept) {
          sessionStorage.setItem(STATE_KEY, JSON.stringify({ filters, sort }))
          const el = getMain()
          if (el) sessionStorage.setItem(SCROLL_KEY, String(el.scrollTop))
          sessionStorage.setItem(LAST_ID_KEY, concept.id)
          router.push(`/app/concepts/${concept.id}`)
        }
      } else if (e.key === ' ') {
        e.preventDefault()
        setPanelOpen((p) => !p)
      } else if (e.key === '+' || e.key === '=') {
        const concept = results[focusedIdx]
        if (concept) incrementMut.mutate(concept.id)
      } else if (e.key === '-') {
        const concept = results[focusedIdx]
        if (concept) decrementMut.mutate(concept.id)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  function saveState(conceptId: string) {
    sessionStorage.setItem(STATE_KEY, JSON.stringify({ filters, sort }))
    const el = getMain()
    if (el) sessionStorage.setItem(SCROLL_KEY, String(el.scrollTop))
    sessionStorage.setItem(LAST_ID_KEY, conceptId)
  }

  function handleDelete(e: React.MouseEvent, concept: Concept) {
    e.preventDefault()
    setDeleteTarget(concept)
  }

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 py-10 pb-44">
      <div className="flex items-baseline justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Library</h1>
        <span className="text-sm text-gray-400">{results.length} total</span>
      </div>

      <div className="relative mb-4">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true">
          <svg viewBox="0 0 18 18" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="7.5" cy="7.5" r="5" />
            <line x1="11.5" y1="11.5" x2="16" y2="16" />
          </svg>
        </span>
        <label htmlFor="library-search-input" className="sr-only">Search concept names</label>
        <input
          id="library-search-input"
          type="search"
          value={nameQuery}
          onChange={(e) => setNameQuery(e.target.value)}
          placeholder="Search concept names..."
          aria-label="Search concept names"
          className="w-full border border-gray-200 rounded pl-9 pr-4 py-1 text-sm bg-white transition-colors hover:border-blue-200 hover:bg-blue-50/30 focus:outline-none focus:border-blue-400 focus:bg-blue-50/40"
        />
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
        { keyLabel: '↑ ↓', actionLabel: 'Navigate' },
        { keyLabel: 'Space', actionLabel: 'MVK' },
        { keyLabel: 'Enter', actionLabel: 'Open' },
        { keyLabel: '+ / −', actionLabel: 'Review Count' },
      ]} />

      {results.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          {allConcepts.length === 0 ? 'No concepts yet. Create your first concept to get started.' : 'No concepts match the current filters.'}
        </div>
      ) : (
        <div className="space-y-1.5">
          {results.map((concept, idx) => (
            <ListConceptRow
              key={concept.id}
              concept={concept}
              focused={idx === focusedIdx}
              subjects={subjects}
              onFocus={() => setFocusedConceptId(concept.id)}
              onSaveState={() => saveState(concept.id)}
              onDelete={(e) => handleDelete(e, concept)}
              onUpdateField={(field, value) => updateFieldMut.mutate({ id: concept.id, field: field as 'state' | 'priority' | 'pinned', value: value as ConceptState | ConceptPriority | boolean })}
              onIncrementReview={() => incrementMut.mutate(concept.id)}
              onDecrementReview={() => decrementMut.mutate(concept.id)}
            />
          ))}
        </div>
      )}

      <MvkDrawer
        collapsed={collapsed}
        panelOpen={panelOpen}
        onTogglePanelOpen={() => setPanelOpen((p) => !p)}
        focusedConcept={focusedConcept}
        onSave={(value) => { if (focusedConcept) updateContentMut.mutate({ id: focusedConcept.id, field: 'mvkNotes', value }) }}
      />

      {deleteTarget && (
        <DeleteConceptDialog
          conceptName={deleteTarget.name}
          onConfirm={() => {
              const idx = results.findIndex((c) => c.id === deleteTarget!.id)
              pendingFocusIdRef.current = getNextFocusId(results, idx)
              deleteMut.mutate(deleteTarget!.id)
              setDeleteTarget(null)
            }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}

interface ListConceptRowProps {
  concept: Concept
  focused: boolean
  subjects: { id: string; name: string }[]
  onFocus: () => void
  onSaveState: () => void
  onDelete: (e: React.MouseEvent) => void
  onUpdateField: (field: string, value: unknown) => void
  onIncrementReview: () => void
  onDecrementReview: () => void
}

function ListConceptRow({ concept, focused, subjects, onFocus, onSaveState, onDelete, onUpdateField, onIncrementReview, onDecrementReview }: ListConceptRowProps) {
  const conceptSubjects = subjects.filter((s) => concept.subjectIds.includes(s.id))

  return (
    <div
      id={`lib-${concept.id}`}
      className={`border rounded-md transition-all ${
        focused ? 'bg-gray-100/80 border-gray-300' : 'bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300'
      }`}
      onClick={onFocus}
    >
      <div className="flex flex-col gap-1.5 px-4 py-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex-1 min-w-0 break-words">
          <Link
            href={`/app/concepts/${concept.id}`}
            onClick={onSaveState}
            className="font-inter text-sm font-semibold text-gray-900 tracking-normal hover:text-blue-700 transition-colors"
          >
            {concept.pinned && <PinIcon size={10} className="inline text-amber-400 mr-1.5 -mt-px" />}
            {concept.name}
          </Link>
          {conceptSubjects.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {conceptSubjects.map((s) => (
                <span key={s.id} className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full">{s.name}</span>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center flex-shrink-0 w-full sm:w-auto justify-between sm:justify-end sm:gap-2">
          <div className="flex items-center gap-2">
            <StateSelector value={concept.state} onChange={(v) => onUpdateField('state', v)} />
            <PriorityBadge value={concept.priority} onChange={(v) => onUpdateField('priority', v)} />
          </div>
          <div className="flex items-center gap-2">
            <ReviewCounter count={concept.reviewCount} onIncrement={onIncrementReview} onDecrement={onDecrementReview} />
            <PinButton pinned={concept.pinned} onToggle={() => onUpdateField('pinned', !concept.pinned)} />
            <button
              onClick={onDelete}
              className="text-gray-300 hover:text-red-500 transition-colors text-sm leading-none focus:outline-none rounded"
              aria-label={`Delete concept: ${concept.name}`}
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
