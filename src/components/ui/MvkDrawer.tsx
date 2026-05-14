'use client'

import { useState, useRef, useEffect } from 'react'
import InlineEditor from './InlineEditor'
import { MVK_GUIDANCE_DISPLAY, MVK_EDIT_PLACEHOLDER } from './MarkdownEditor'

const STORAGE_KEY = 'mvk-panel-height'
const DEFAULT_HEIGHT = 128  // px — matches old max-h-32
const MIN_HEIGHT = 80       // px
const MAX_HEIGHT_VH = 0.5   // 50vh

interface MvkDrawerProps {
  collapsed: boolean
  panelOpen: boolean
  onTogglePanelOpen: () => void
  focusedConcept: { id: string; mvkNotes: string | null } | null
  onSave: (value: string) => void
}

export default function MvkDrawer({
  collapsed,
  panelOpen,
  onTogglePanelOpen,
  focusedConcept,
  onSave,
}: MvkDrawerProps) {
  const [panelHeight, setPanelHeight] = useState<number>(() => {
    if (typeof window === 'undefined') return DEFAULT_HEIGHT
    const stored = localStorage.getItem(STORAGE_KEY)
    const parsed = stored ? parseInt(stored, 10) : NaN
    if (!Number.isFinite(parsed)) return DEFAULT_HEIGHT
    return Math.min(parsed, window.innerHeight * MAX_HEIGHT_VH)
  })
  const [isEditing, setIsEditing] = useState(false)

  // Tracks latest height for localStorage save inside drag closure
  const currentHeightRef = useRef(panelHeight)
  // Holds cleanup fn so we can cancel on unmount mid-drag
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    return () => { cleanupRef.current?.() }
  }, [])

  // Reset to default height each time the panel is opened; reset editing state on close
  useEffect(() => {
    if (panelOpen) {
      setPanelHeight(DEFAULT_HEIGHT)
      currentHeightRef.current = DEFAULT_HEIGHT
    } else {
      setIsEditing(false)
    }
  }, [panelOpen])

  function handlePointerDown(e: React.PointerEvent) {
    e.preventDefault()
    const startY = e.clientY
    const startH = panelHeight
    const isTouch = e.pointerType === 'touch'
    currentHeightRef.current = startH

    document.body.style.userSelect = 'none'
    if (!isTouch) document.body.style.cursor = 'ns-resize'

    function onMove(ev: PointerEvent) {
      const deltaY = startY - ev.clientY  // drag up = positive = taller
      const maxH = window.innerHeight * MAX_HEIGHT_VH
      const newH = Math.min(maxH, Math.max(MIN_HEIGHT, startH + deltaY))
      currentHeightRef.current = newH
      setPanelHeight(newH)
    }

    function onUp() {
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      localStorage.setItem(STORAGE_KEY, String(currentHeightRef.current))
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      cleanupRef.current = null
    }

    cleanupRef.current = () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }

  return (
    <div
      className={`fixed bottom-0 right-0 z-20 bg-gray-900 transition-all duration-200 max-md:left-0 ${
        collapsed ? 'md:left-16' : 'md:left-60'
      }`}
    >
      {panelOpen && (
        <div
          className="bg-white border-t border-gray-200 shadow-[0_-4px_24px_rgba(0,0,0,0.07)] flex flex-col"
          style={{ height: panelHeight }}
        >
          {focusedConcept ? (
            <InlineEditor
              key={focusedConcept.id}
              content={focusedConcept.mvkNotes ?? ''}
              hint={MVK_GUIDANCE_DISPLAY}
              editPlaceholder={MVK_EDIT_PLACEHOLDER}
              onSave={onSave}
              isEditing={isEditing}
              onEditChange={setIsEditing}
              onResizePointerDown={handlePointerDown}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-xs text-gray-400 italic">No concept selected.</p>
            </div>
          )}
        </div>
      )}

      <button
        onClick={onTogglePanelOpen}
        className="w-full flex items-center justify-between px-6 py-2.5 bg-gray-900 hover:bg-gray-800 transition-colors group outline-none focus:outline-none"
      >
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] font-semibold text-gray-300 uppercase tracking-widest">MVK</span>
          <span className="text-[10px] text-gray-600 group-hover:text-gray-500 transition-colors hidden sm:inline">
            Minimum Viable Knowledge
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded border border-gray-700 text-[10px] text-gray-600 group-hover:text-gray-400 group-hover:border-gray-600 transition-colors font-mono leading-none select-none">
            Space
          </kbd>
          <svg
            className={`w-3.5 h-3.5 text-gray-500 group-hover:text-gray-300 transition-all duration-200 ${
              panelOpen ? 'rotate-180' : ''
            }`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
          </svg>
        </div>
      </button>
    </div>
  )
}
