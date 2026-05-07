'use client'

import { useState, useEffect, useRef, useMemo, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { useConcepts, useUpdateConceptContent, useIncrementReview, useDecrementReview } from '@/hooks/useConcepts'
import { useSubjects, useTopics, useSubtopics, useTags } from '@/hooks/useSubjects'
import { useSidebarState } from '@/components/providers/SidebarStateProvider'
import { useFilterSort } from '@/hooks/useFilterSort'
import { useViewStateRegistry } from '@/components/providers/ViewStateRegistryProvider'
import FilterSortBar from '@/components/ui/FilterSortBar'
import ShortcutsHintBar from '@/components/ui/ShortcutsHintBar'
import { PinIcon } from '@/components/ui/StatusBadge'
import MvkDrawer from '@/components/ui/MvkDrawer'
import type { FilterState } from '@/hooks/useFilterSort'
import type { Concept } from '@/lib/types'

const SCROLL_KEY  = 'scroll-index'
const LAST_ID_KEY = 'index-last-id'
const STATE_KEY   = 'index-view-state'
const getMain = () => document.getElementById('main-content')

function isEditableTarget(e: KeyboardEvent) {
  const t = e.target as HTMLElement
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.contentEditable === 'true'
}

/**
 * Groups a flat concept list (already sorted) into alphabetical sections.
 * Non A–Z names go under '#' (numbers first, then symbols, lexicographic).
 *
 * IMPORTANT: The '#' group is custom-sorted (numeric-first) which can differ
 * from the A-Z order of the incoming `concepts` array. We assign `visualIdx`
 * AFTER all sorting so it always matches the on-screen position. All keyboard
 * navigation uses these visual indices rather than the filtered-array indices,
 * preventing the mismatch that caused elements to be skipped or focused at the
 * wrong position.
 */
function groupByLetter(concepts: Concept[]): { letter: string; items: { concept: Concept; visualIdx: number }[] }[] {
  const map: Record<string, Concept[]> = {}
  concepts.forEach((c) => {
    const first = (c.name?.trim()[0] ?? '').toUpperCase()
    const key = /^[A-Z]$/.test(first) ? first : '#'
    if (!map[key]) map[key] = []
    map[key].push(c)
  })

  if (map['#']) {
    map['#'].sort((a, b) => {
      const na = a.name, nb = b.name
      const aNum = /^\d/.test(na), bNum = /^\d/.test(nb)
      if (aNum && bNum) return parseFloat(na) - parseFloat(nb)
      if (aNum) return -1
      if (bNum) return 1
      return na.localeCompare(nb)
    })
  }

  const keys = Object.keys(map).sort((a, b) => {
    if (a === '#') return -1
    if (b === '#') return 1
    return a.localeCompare(b)
  })

  // Assign visual indices sequentially after all sorting is done so they
  // always reflect the actual rendered order (including '#' custom sort).
  let visualIdx = 0
  return keys.map((letter) => ({
    letter,
    items: map[letter].map((concept) => ({ concept, visualIdx: visualIdx++ })),
  }))
}

interface BoundingEntry {
  idx: number
  left: number
  right: number
  top: number
  bottom: number
}

/**
 * Visual up/down navigation using TOP-based row detection.
 *
 * All elements in the same CSS grid row share an identical `top` value, so
 * comparing tops is robust against the row-stretch effect that `line-clamp-3`
 * causes: the focused element grows taller, the grid stretches the whole row,
 * and `bottom` values of non-focused peers become artificially large. Comparing
 * tops sidesteps that entirely.
 *
 * `concepts` must be in VISUAL order (i.e. `visualOrder`, not `filtered`) so
 * that the returned index is a valid visual index.
 */
function getVisualNavIndex(direction: 'up' | 'down', currentIdx: number, concepts: Concept[]): number {
  const els: BoundingEntry[] = concepts
    .map((c, i) => {
      const el = document.getElementById(`idx-${c.id}`)
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { idx: i, left: r.left, right: r.right, top: r.top, bottom: r.bottom }
    })
    .filter((x): x is BoundingEntry => x !== null)

  const cur = els.find((e) => e.idx === currentIdx)
  if (!cur) return currentIdx

  if (direction === 'down') {
    const below = els.filter((e) => e.top > cur.top + 2)
    if (!below.length) return currentIdx
    const minTop = Math.min(...below.map((e) => e.top))
    const row = below.filter((e) => e.top <= minTop + 4)
    const overlapping = row.filter((e) => e.left < cur.right && e.right > cur.left)
    const candidates = overlapping.length ? overlapping : row
    return candidates.reduce((best, e) => (e.left < best.left ? e : best)).idx
  } else {
    const above = els.filter((e) => e.top < cur.top - 2)
    if (!above.length) return currentIdx
    const maxTop = Math.max(...above.map((e) => e.top))
    const row = above.filter((e) => e.top >= maxTop - 4)
    const overlapping = row.filter((e) => e.left < cur.right && e.right > cur.left)
    const candidates = overlapping.length ? overlapping : row
    return candidates.reduce((best, e) => (e.right > best.right ? e : best)).idx
  }
}

export default function IndexMode() {
  const router = useRouter()
  const { collapsed } = useSidebarState()
  const { registerViewStateSaver } = useViewStateRegistry()

  const { data: allConcepts = [] } = useConcepts()
  const { data: subjects = [] } = useSubjects()
  const { data: topics = [] } = useTopics()
  const { data: subtopics = [] } = useSubtopics()
  const { data: tags = [] } = useTags()
  const updateContentMut = useUpdateConceptContent()
  const incrementMut = useIncrementReview()
  const decrementMut = useDecrementReview()

  // Restore filter/sort state if returning from ConceptView (read before first render)
  const [savedState] = useState<{ filters: FilterState; sort: string } | null>(() => {
    if (typeof window === 'undefined') return null
    if (!sessionStorage.getItem('cv-back')) return null
    try { return JSON.parse(sessionStorage.getItem(STATE_KEY) || 'null') } catch { return null }
  })

  const { filtered, filters, sort, setFilter, setSort, clearFilters, hasActiveFilters } =
    useFilterSort(allConcepts, { initialFilters: savedState?.filters, initialSort: savedState?.sort })

  // groups is the rendered structure; visualOrder is concepts in exactly the
  // order they appear on screen (including '#' custom sort). focusedIdx always
  // indexes into visualOrder, not into filtered.
  const groups = groupByLetter(filtered)
  const visualOrder = groups.flatMap((g) => g.items.map((item) => item.concept))

  // Track focus by concept ID so sort-order changes after reviewCount updates
  // never reset focus to index 0. focusedIdx is derived from the ID.
  const [focusedConceptId, setFocusedConceptId] = useState<string | null>(null)
  const focusedConceptIdRef = useRef<string | null>(null)
  focusedConceptIdRef.current = focusedConceptId
  const focusedIdx = useMemo(() => {
    if (!focusedConceptId) return 0
    const idx = visualOrder.findIndex((c) => c.id === focusedConceptId)
    return idx >= 0 ? idx : 0
  }, [visualOrder, focusedConceptId])

  const [panelOpen, setPanelOpen] = useState(false)
  const focusedConcept = visualOrder[focusedIdx] ?? null

  // Registry ref: inline assignment keeps closure fresh every render.
  const saveStateForRegistryRef = useRef<() => void>(() => {})
  saveStateForRegistryRef.current = () => {
    sessionStorage.setItem(STATE_KEY, JSON.stringify({ filters, sort }))
    const el = getMain()
    if (el) sessionStorage.setItem(SCROLL_KEY, String(el.scrollTop))
    const id = visualOrder[focusedIdx]?.id
    if (id) sessionStorage.setItem(LAST_ID_KEY, id)
  }

  useEffect(() => {
    return registerViewStateSaver(() => saveStateForRegistryRef.current())
  }, [registerViewStateSaver])

  const suppressScroll = useRef(false)
  const backRestoring = useRef(false)
  const pendingFocusId = useRef<string | null>(null)

  // Restore scroll/focus when returning from ConceptView
  useEffect(() => {
    const el = getMain()
    if (el) el.scrollTop = 0

    if (!sessionStorage.getItem('cv-back')) return

    // Next.js router cache can serve IndexMode from cache (no remount) when the
    // user presses Back, leaving cv-back in sessionStorage unconsumed. On a
    // later fresh mount (page refresh or direct navigation) that stale entry
    // would incorrectly trigger restoration. ConceptView sets
    // window.__cvBackPending right before router.back() — a value that resets
    // on page refresh unlike sessionStorage — so we can tell a genuine
    // back-navigation from a stale entry.
    const isGenuineBackNav = !!(window as any).__cvBackPending
    ;(window as any).__cvBackPending = false

    sessionStorage.removeItem('cv-back')
    sessionStorage.removeItem(STATE_KEY)

    if (!isGenuineBackNav) {
      sessionStorage.removeItem(SCROLL_KEY)
      sessionStorage.removeItem(LAST_ID_KEY)
      return
    }

    const savedScroll = sessionStorage.getItem(SCROLL_KEY)
    sessionStorage.removeItem(SCROLL_KEY)
    const lastId = sessionStorage.getItem(LAST_ID_KEY)
    sessionStorage.removeItem(LAST_ID_KEY)

    if (!lastId) return

    const idx = visualOrder.findIndex((c) => c.id === lastId)
    if (idx >= 0) {
      backRestoring.current = true
      setFocusedConceptId(lastId!)
    } else {
      pendingFocusId.current = lastId
    }

    if (savedScroll) {
      suppressScroll.current = true
      const pos = parseInt(savedScroll, 10)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el2 = getMain()
          if (el2) el2.scrollTop = pos
          suppressScroll.current = false
        })
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Deferred focus restoration if visualOrder was empty on first render
  useEffect(() => {
    if (!pendingFocusId.current || !visualOrder.length) return
    const id = pendingFocusId.current
    const idx = visualOrder.findIndex((c) => c.id === id)
    if (idx < 0) return
    pendingFocusId.current = null
    backRestoring.current = true
    setFocusedConceptId(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered])

  // Reset focus when the visible concept set changes (filter/sort change).
  // If the previously focused concept is still visible (e.g. sort reorder from a
  // reviewCount update), skip the reset — focusedIdx auto-recalculates via useMemo.
  const visualOrderKey = visualOrder.map((c) => c.id).join(',')
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    if (backRestoring.current) { backRestoring.current = false; return }
    const prevId = focusedConceptIdRef.current
    if (prevId && visualOrder.some((c) => c.id === prevId)) return
    setFocusedConceptId(visualOrder[0]?.id ?? null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visualOrderKey])

  // Scroll focused pill into view
  useEffect(() => {
    if (suppressScroll.current) return
    const concept = visualOrder[focusedIdx]
    if (!concept) return
    const el = document.getElementById(`idx-${concept.id}`)
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'instant' })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedIdx, filtered])

  // Keyboard navigation — stateRef captures visualOrder so the closure always
  // sees the current array without needing to be re-registered.
  const stateRef = useRef({ visualOrder, focusedIdx, filters, sort })
  stateRef.current = { visualOrder, focusedIdx, filters, sort }
  const lastNavTime = useRef(0)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isEditableTarget(e)) return
      const { visualOrder, focusedIdx, filters, sort } = stateRef.current
      if (!visualOrder.length) return

      if (e.key === 'ArrowRight') {
        e.preventDefault()
        const now = Date.now()
        if (e.repeat && now - lastNavTime.current < 180) return
        lastNavTime.current = now
        const newIdx = Math.min(focusedIdx + 1, visualOrder.length - 1)
        setFocusedConceptId(visualOrder[newIdx]?.id ?? null)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        const now = Date.now()
        if (e.repeat && now - lastNavTime.current < 180) return
        lastNavTime.current = now
        const newIdx = Math.max(focusedIdx - 1, 0)
        setFocusedConceptId(visualOrder[newIdx]?.id ?? null)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        const now = Date.now()
        if (e.repeat && now - lastNavTime.current < 180) return
        lastNavTime.current = now
        const newIdx = getVisualNavIndex('down', focusedIdx, visualOrder)
        setFocusedConceptId(visualOrder[newIdx]?.id ?? null)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        const now = Date.now()
        if (e.repeat && now - lastNavTime.current < 180) return
        lastNavTime.current = now
        const newIdx = getVisualNavIndex('up', focusedIdx, visualOrder)
        setFocusedConceptId(visualOrder[newIdx]?.id ?? null)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const concept = visualOrder[focusedIdx]
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
        const concept = visualOrder[focusedIdx]
        if (concept) incrementMut.mutate(concept.id)
      } else if (e.key === '-') {
        const concept = visualOrder[focusedIdx]
        if (concept) decrementMut.mutate(concept.id)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  function saveNavState(id: string) {
    sessionStorage.setItem(STATE_KEY, JSON.stringify({ filters, sort }))
    const el = getMain()
    if (el) sessionStorage.setItem(SCROLL_KEY, String(el.scrollTop))
    sessionStorage.setItem(LAST_ID_KEY, id)
  }

  function handlePillClick(e: React.MouseEvent, c: Concept, visualIdx: number) {
    if (focusedIdx === visualIdx) {
      saveNavState(c.id)
      router.push(`/app/concepts/${c.id}`)
    } else {
      e.preventDefault()
      setFocusedConceptId(c.id)
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-8 py-10 pb-44">
      <div className="flex items-baseline justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Index</h1>
        <span className="text-sm text-gray-400">{allConcepts.length} total</span>
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
        availableFilters={['subject', 'topic', 'subtopic', 'tag', 'state', 'priority', 'pinned']}
        resultCount={filtered.length}
      />

      <ShortcutsHintBar items={[
        { keyLabel: '← → ↑ ↓', actionLabel: 'Navigate' },
        { keyLabel: 'Space', actionLabel: 'MVK' },
        { keyLabel: 'Enter', actionLabel: 'Open' },
        { keyLabel: '+ / −', actionLabel: 'Review Count' },
      ]} />

      {filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400 text-sm">
          {allConcepts.length === 0 ? 'No concepts yet. Create your first concept to get started.' : 'No concepts match the current filters.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-x-1 gap-y-0">
          {groups.map(({ letter, items }, groupIdx) => (
            <Fragment key={letter}>
              <div
                className={`col-span-full flex items-center gap-3 ${groupIdx === 0 ? 'mb-1' : 'mt-7 mb-1'}`}
              >
                <span className="text-[11px] font-bold text-gray-400 tracking-widest uppercase w-4 text-center flex-shrink-0">
                  {letter}
                </span>
                <div className="flex-1 border-t border-gray-100" />
              </div>

              {items.map(({ concept: c, visualIdx }) => {
                const isFocused = visualIdx === focusedIdx
                return (
                  <div
                    key={c.id}
                    id={`idx-${c.id}`}
                    onClick={(e) => handlePillClick(e, c, visualIdx)}
                    className={`group flex items-baseline gap-1.5 px-2 py-[5px] rounded select-none transition-colors ${
                      isFocused
                        ? 'bg-blue-50 cursor-pointer'
                        : 'hover:bg-blue-50 cursor-default'
                    }`}
                  >
                    {c.pinned && (
                      <PinIcon
                        size={8}
                        className={`flex-shrink-0 ${isFocused ? 'self-start mt-[3px] text-amber-400' : 'self-center -mt-px text-amber-300'}`}
                      />
                    )}
                    <span
                      className={`text-sm leading-snug min-w-0 transition-colors ${
                        isFocused
                          ? 'text-blue-700 font-medium break-words'
                          : 'truncate text-gray-700'
                      }`}
                      title={isFocused ? undefined : c.name}
                    >
                      {c.name}
                    </span>
                    {(c.reviewCount !== undefined && c.reviewCount !== null) && (
                      isFocused ? (
                        <span className="flex items-center gap-0.5 ml-1 flex-shrink-0">
                          <button
                            onClick={(e) => { e.stopPropagation(); decrementMut.mutate(c.id) }}
                            className="text-blue-400 hover:text-blue-600 active:text-blue-600 w-4 h-4 flex items-center justify-center text-xs leading-none rounded"
                            aria-label="Decrease review count"
                          >
                            −
                          </button>
                          <span className="text-[10px] tabular-nums text-blue-400 w-4 text-center">
                            {c.reviewCount}
                          </span>
                          <button
                            onClick={(e) => { e.stopPropagation(); incrementMut.mutate(c.id) }}
                            className="text-blue-400 hover:text-blue-600 active:text-blue-600 w-4 h-4 flex items-center justify-center text-xs leading-none rounded"
                            aria-label="Increase review count"
                          >
                            +
                          </button>
                        </span>
                      ) : (
                        <span className="text-[10px] tabular-nums flex-shrink-0 leading-none ml-2 text-gray-400">
                          {c.reviewCount}
                        </span>
                      )
                    )}
                  </div>
                )
              })}
            </Fragment>
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
    </div>
  )
}
