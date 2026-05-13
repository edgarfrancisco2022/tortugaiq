'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useConcepts, useUpdateConceptField, useUpdateConceptContent, useIncrementReview, useDecrementReview, useDeleteConcept } from '@/hooks/useConcepts'
import { useSubjects, useTopics, useSubtopics, useTags, useSubjectSortMode, useSetSubjectSortMode, useSubjectConceptOrder, useMoveConceptInSubject } from '@/hooks/useSubjects'
import { useSidebarState } from '@/components/providers/SidebarStateProvider'
import { useViewStateRegistry } from '@/components/providers/ViewStateRegistryProvider'
import FilterSortBar from '@/components/ui/FilterSortBar'
import ShortcutsHintBar from '@/components/ui/ShortcutsHintBar'
import { StateSelector, PriorityBadge, ReviewCounter, PinButton, PinIcon } from '@/components/ui/StatusBadge'
import MvkDrawer from '@/components/ui/MvkDrawer'
import DeleteConceptDialog from '@/components/ui/DeleteConceptDialog'
import { sortConcepts } from '@/hooks/useFilterSort'
import type { FilterState } from '@/hooks/useFilterSort'
import type { Concept, ConceptState, ConceptPriority, SubjectSortMode } from '@/lib/types'

const SUBJECT_SORT_LABELS: Record<string, string> = {
  alpha: 'A → Z',
  alpha_desc: 'Z → A',
  date_new: 'Newest first',
  date_old: 'Oldest first',
  reviews_high: 'Most reviewed',
  reviews_low: 'Least reviewed',
  custom: 'Custom',
}
const SUBJECT_AVAILABLE_SORTS = ['alpha', 'alpha_desc', 'date_new', 'date_old', 'reviews_high', 'reviews_low', 'custom']
const SCROLL_KEY  = (sid: string) => `scroll-subject-${sid}`
const LAST_ID_KEY = (sid: string) => `subject-last-id-${sid}`
const STATE_KEY   = (sid: string) => `subject-state-${sid}`
const getMain = () => document.getElementById('main-content')

const EMPTY_FILTERS: FilterState = { topics: [], subtopics: [], tags: [], states: [], priorities: [], pinned: false }

function isEditableTarget(e: KeyboardEvent) {
  const t = e.target as HTMLElement
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.contentEditable === 'true'
}

function getNextFocusId(list: Concept[], deletedIdx: number): string | null {
  if (list.length <= 1) return null
  if (deletedIdx < 0) return list[0]?.id ?? null
  const nextIdx = deletedIdx < list.length - 1 ? deletedIdx + 1 : deletedIdx - 1
  return list[nextIdx]?.id ?? null
}

export default function SubjectView() {
  const { subjectId } = useParams<{ subjectId: string }>()
  const router = useRouter()
  const { collapsed } = useSidebarState()
  const { registerViewStateSaver } = useViewStateRegistry()

  const { data: allConcepts = [], isLoading: conceptsLoading } = useConcepts()
  const { data: subjects = [] } = useSubjects()
  const { data: topics = [] } = useTopics()
  const { data: subtopics = [] } = useSubtopics()
  const { data: tags = [] } = useTags()
  const { data: sortMode = 'alpha' } = useSubjectSortMode(subjectId)
  const { data: subjectOrder = [] } = useSubjectConceptOrder(subjectId)
  const setSortModeMut = useSetSubjectSortMode(subjectId)
  const moveMut = useMoveConceptInSubject(subjectId)
  const updateFieldMut = useUpdateConceptField()
  const updateContentMut = useUpdateConceptContent()
  const incrementMut = useIncrementReview()
  const decrementMut = useDecrementReview()
  const deleteMut = useDeleteConcept()

  const subject = subjects.find((s) => s.id === subjectId) ?? null

  // Restore filter state if returning from ConceptView (read before first render).
  // Guard with __cvBackPending so a stale cv-back entry (after a hard refresh or
  // cache-served back-nav) never incorrectly initialises filters from an old session.
  const [savedState] = useState<{ filters: FilterState } | null>(() => {
    if (typeof window === 'undefined') return null
    if (!sessionStorage.getItem('cv-back')) return null
    if (!(window as any).__cvBackPending) return null
    try { return JSON.parse(sessionStorage.getItem(STATE_KEY(subjectId)) || 'null') } catch { return null }
  })

  const [filters, setFiltersState] = useState<FilterState>(() => savedState?.filters ?? EMPTY_FILTERS)

  // Track focus by concept ID so sort-order changes (e.g. after a reviewCount
  // update) never reset focus to index 0. focusedIdx is derived from the ID.
  const [focusedConceptId, setFocusedConceptId] = useState<string | null>(null)
  const focusedConceptIdRef = useRef<string | null>(null)
  const pendingFocusIdRef = useRef<string | null | undefined>(undefined)

  const [panelOpen, setPanelOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Concept | null>(null)

  function setFilter(key: keyof FilterState, value: string[] | boolean) {
    setFiltersState((f) => ({ ...f, [key]: value }))
  }
  function clearFilters() { setFiltersState(EMPTY_FILTERS) }

  const hasActiveFilters = Boolean(
    filters.topics?.length || filters.subtopics?.length || filters.tags?.length ||
    filters.states?.length || filters.priorities?.length || filters.pinned
  )

  // Registry ref: inline assignment keeps closure fresh every render.
  const saveStateForRegistryRef = useRef<() => void>(() => {})
  saveStateForRegistryRef.current = () => {
    sessionStorage.setItem(STATE_KEY(subjectId), JSON.stringify({ filters }))
    const el = getMain()
    if (el) sessionStorage.setItem(SCROLL_KEY(subjectId), String(el.scrollTop))
    const id = displayed[focusedIdx]?.id
    if (id) sessionStorage.setItem(LAST_ID_KEY(subjectId), id)
  }

  useEffect(() => {
    return registerViewStateSaver(() => saveStateForRegistryRef.current())
  }, [registerViewStateSaver])

  const suppressScroll = useRef(false)
  const backRestoring = useRef(false)

  const subjectConcepts = allConcepts.filter((c) => c.subjectId === subjectId)

  const displayed = useMemo(() => {
    const filtered = subjectConcepts.filter((c) => {
      if (filters.topics?.length && !filters.topics.some((id) => c.topicId === id)) return false
      if (filters.subtopics?.length && !filters.subtopics.some((id) => c.subtopicId === id)) return false
      if (filters.tags?.length && !filters.tags.some((id) => c.tagIds.includes(id))) return false
      if (filters.states?.length && !filters.states.includes(c.state ?? 'NEW')) return false
      if (filters.priorities?.length && !filters.priorities.includes(c.priority ?? 'MEDIUM')) return false
      if (filters.pinned && !c.pinned) return false
      return true
    })
    if (sortMode !== 'custom') return sortConcepts(filtered, sortMode)
    if (sortMode === 'custom') {
      return [...filtered].sort((a, b) => {
        const ia = subjectOrder.indexOf(a.id), ib = subjectOrder.indexOf(b.id)
        if (ia === -1 && ib === -1) return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        if (ia === -1) return 1; if (ib === -1) return -1
        return ia - ib
      })
    }
    return filtered
  }, [subjectConcepts, filters, sortMode, subjectOrder, subjectId])

  focusedConceptIdRef.current = focusedConceptId
  const focusedIdx = useMemo(() => {
    if (!focusedConceptId) return 0
    const idx = displayed.findIndex((c) => c.id === focusedConceptId)
    return idx >= 0 ? idx : 0
  }, [displayed, focusedConceptId])

  // Scroll to top on mount; restore scroll/focus if returning from ConceptView.
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
      sessionStorage.removeItem(STATE_KEY(subjectId))

      if (!isGenuineBackNav) {
        // Stale cv-back — discard saved keys and start fresh.
        sessionStorage.removeItem(SCROLL_KEY(subjectId))
        sessionStorage.removeItem(LAST_ID_KEY(subjectId))
        return
      }

      const saved = sessionStorage.getItem(SCROLL_KEY(subjectId))
      sessionStorage.removeItem(SCROLL_KEY(subjectId))
      const lastId = sessionStorage.getItem(LAST_ID_KEY(subjectId))
      sessionStorage.removeItem(LAST_ID_KEY(subjectId))

      const idx = lastId ? displayed.findIndex((c) => c.id === lastId) : -1
      if (idx >= 0) {
        backRestoring.current = true
        setFocusedConceptId(lastId!)
      }

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
  }, [subjectId])

  // Reset focus when the visible concept set changes (filter/sort change).
  // If the previously focused concept is still visible (e.g. sort reorder from a
  // reviewCount update), skip the reset — focusedIdx auto-recalculates via useMemo.
  const displayedKey = displayed.map((c) => c.id).join(',')
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    if (backRestoring.current) { backRestoring.current = false; return }
    const prevId = focusedConceptIdRef.current
    if (prevId && displayed.some((c) => c.id === prevId)) return
    if (pendingFocusIdRef.current !== undefined) {
      const target = pendingFocusIdRef.current
      pendingFocusIdRef.current = undefined
      setFocusedConceptId(target)
      return
    }
    setFocusedConceptId(displayed[0]?.id ?? null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayedKey])

  // Scroll focused row into view — fires only when focus explicitly changes (keyboard
  // nav, row click, back-nav restore), NOT on every data re-render. This prevents the
  // active row from being pulled back into view when the user scrolls away and then
  // clicks +/− on a different concept row.
  useEffect(() => {
    if (suppressScroll.current) return
    const concept = displayed[focusedIdx]
    if (!concept) return
    const el = document.getElementById(`sub-${concept.id}`)
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'instant' })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedConceptId])

  const focusedConcept = displayed[focusedIdx] ?? null

  // Keyboard navigation — stateRef keeps closures fresh every render
  const stateRef = useRef({ displayed, focusedIdx, filters })
  stateRef.current = { displayed, focusedIdx, filters }
  const lastNavTime = useRef(0)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isEditableTarget(e)) return
      const { displayed, focusedIdx, filters } = stateRef.current
      if (!displayed.length) return

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        const now = Date.now()
        if (e.repeat && now - lastNavTime.current < 180) return
        lastNavTime.current = now
        const newIdx = Math.min(focusedIdx + 1, displayed.length - 1)
        setFocusedConceptId(displayed[newIdx]?.id ?? null)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        const now = Date.now()
        if (e.repeat && now - lastNavTime.current < 180) return
        lastNavTime.current = now
        const newIdx = Math.max(focusedIdx - 1, 0)
        setFocusedConceptId(displayed[newIdx]?.id ?? null)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const concept = displayed[focusedIdx]
        if (concept) {
          sessionStorage.setItem(STATE_KEY(subjectId), JSON.stringify({ filters }))
          const el = getMain()
          if (el) sessionStorage.setItem(SCROLL_KEY(subjectId), String(el.scrollTop))
          sessionStorage.setItem(LAST_ID_KEY(subjectId), concept.id)
          router.push(`/app/concepts/${concept.id}`)
        }
      } else if (e.key === ' ') {
        e.preventDefault()
        setPanelOpen((p) => !p)
      } else if (e.key === '+' || e.key === '=') {
        const concept = displayed[focusedIdx]
        if (concept) incrementMut.mutate(concept.id)
      } else if (e.key === '-') {
        const concept = displayed[focusedIdx]
        if (concept) decrementMut.mutate(concept.id)
      } else if (e.key === 'Backspace') {
        e.preventDefault()
        router.back()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, subjectId])

  if (!subject && subjects.length > 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-400">Subject not found.</p>
      </div>
    )
  }

  function handleDelete(e: React.MouseEvent, concept: Concept) {
    e.preventDefault()
    setDeleteTarget(concept)
  }

  function saveState(conceptId: string) {
    sessionStorage.setItem(STATE_KEY(subjectId), JSON.stringify({ filters }))
    const el = getMain()
    if (el) sessionStorage.setItem(SCROLL_KEY(subjectId), String(el.scrollTop))
    sessionStorage.setItem(LAST_ID_KEY(subjectId), conceptId)
  }

  function canMoveUp(conceptId: string) {
    if (sortMode !== 'custom' || hasActiveFilters) return false
    return subjectOrder.indexOf(conceptId) > 0
  }
  function canMoveDown(conceptId: string) {
    if (sortMode !== 'custom' || hasActiveFilters) return false
    const idx = subjectOrder.indexOf(conceptId)
    return idx >= 0 && idx < subjectOrder.length - 1
  }

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 py-10 pb-44">
      <div className="flex items-baseline justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{subject?.name ?? '…'}</h1>
        <span className="text-sm text-gray-400">{subjectConcepts.length} total</span>
      </div>

      <FilterSortBar
        filters={filters}
        sort={sortMode}
        setFilter={setFilter}
        setSort={(mode) => setSortModeMut.mutate(mode as SubjectSortMode)}
        clearFilters={clearFilters}
        hasActiveFilters={hasActiveFilters}
        topics={topics}
        subtopics={subtopics}
        tags={tags}
        availableSorts={SUBJECT_AVAILABLE_SORTS}
        availableFilters={['topic', 'subtopic', 'tag', 'state', 'priority', 'pinned']}
        sortLabels={SUBJECT_SORT_LABELS}
        resultCount={displayed.length}
      />

      <ShortcutsHintBar items={[
        { keyLabel: '↑ ↓', actionLabel: 'Navigate' },
        { keyLabel: 'Space', actionLabel: 'MVK' },
        { keyLabel: 'Enter', actionLabel: 'Open' },
        { keyLabel: '⌫', actionLabel: 'Back' },
        { keyLabel: '+ / −', actionLabel: 'Review Count' },
      ]} />

      {sortMode === 'custom' && hasActiveFilters && (
        <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg mb-3">
          Move controls are disabled while filters are active.
        </p>
      )}

      {conceptsLoading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          {subjectConcepts.length === 0 ? 'No concepts in this subject yet.' : 'No concepts match the current filters.'}
        </div>
      ) : (
        <div className="space-y-1.5">
          {displayed.map((concept, idx) => (
            <ConceptRow
              key={concept.id}
              concept={concept}
              focused={idx === focusedIdx}
              onFocus={() => setFocusedConceptId(concept.id)}
              isCustom={sortMode === 'custom' && !hasActiveFilters}
              canUp={canMoveUp(concept.id)}
              canDown={canMoveDown(concept.id)}
              onMoveUp={(e) => { e.preventDefault(); moveMut.mutate({ conceptId: concept.id, direction: 'up' }) }}
              onMoveDown={(e) => { e.preventDefault(); moveMut.mutate({ conceptId: concept.id, direction: 'down' }) }}
              onDelete={(e) => handleDelete(e, concept)}
              onSaveState={() => saveState(concept.id)}
              onUpdateField={(f, v) => updateFieldMut.mutate({ id: concept.id, field: f as 'state' | 'priority' | 'pinned', value: v as ConceptState | ConceptPriority | boolean })}
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
              const idx = displayed.findIndex((c) => c.id === deleteTarget!.id)
              pendingFocusIdRef.current = getNextFocusId(displayed, idx)
              deleteMut.mutate(deleteTarget!.id)
              setDeleteTarget(null)
            }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}

interface ConceptRowProps {
  concept: Concept
  focused: boolean
  onFocus: () => void
  isCustom: boolean
  canUp: boolean
  canDown: boolean
  onMoveUp: (e: React.MouseEvent) => void
  onMoveDown: (e: React.MouseEvent) => void
  onDelete: (e: React.MouseEvent) => void
  onSaveState: () => void
  onUpdateField: (field: string, value: unknown) => void
  onIncrementReview: () => void
  onDecrementReview: () => void
}

function ConceptRow({ concept, focused, onFocus, isCustom, canUp, canDown, onMoveUp, onMoveDown, onDelete, onSaveState, onUpdateField, onIncrementReview, onDecrementReview }: ConceptRowProps) {
  return (
    <div
      id={`sub-${concept.id}`}
      className={`border rounded-md transition-all ${
        focused ? 'bg-gray-100/80 border-gray-300' : 'bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300'
      }`}
      onClick={onFocus}
    >
      <div className="flex flex-col gap-1.5 px-4 py-2 sm:flex-row sm:items-center sm:gap-2">
        <div className="flex-1 min-w-0 break-words">
          <Link
            href={`/app/concepts/${concept.id}`}
            onClick={onSaveState}
            className="font-inter text-sm font-semibold text-gray-900 tracking-normal hover:text-blue-700 transition-colors"
          >
            {concept.pinned && <PinIcon size={10} className="inline text-amber-400 mr-1.5 -mt-px" />}
            {concept.name}
          </Link>
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

            {isCustom && (
              <div className="flex flex-col gap-0 flex-shrink-0 ml-1">
                <button
                  onClick={onMoveUp}
                  disabled={!canUp}
                  className="text-gray-300 hover:text-gray-600 disabled:opacity-20 leading-tight text-xs px-0.5 focus:outline-none rounded"
                  aria-label={`Move ${concept.name} up`}
                >
                  <span aria-hidden="true">↑</span>
                </button>
                <button
                  onClick={onMoveDown}
                  disabled={!canDown}
                  className="text-gray-300 hover:text-gray-600 disabled:opacity-20 leading-tight text-xs px-0.5 focus:outline-none rounded"
                  aria-label={`Move ${concept.name} down`}
                >
                  <span aria-hidden="true">↓</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
