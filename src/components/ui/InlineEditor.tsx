'use client'

import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import MarkdownHelpPanel from './MarkdownHelpPanel'
import { useDirtyState } from '@/components/providers/DirtyStateProvider'
import { MD_PLUGINS, mdComponents } from '@/lib/md-config'

interface Props {
  content?: string
  placeholder?: string
  hint?: React.ReactNode
  editPlaceholder?: string
  onSave: (value: string) => void
  /** Controlled editing state — when provided, lifts isEditing up to the parent (MvkDrawer) */
  isEditing?: boolean
  onEditChange?: (v: boolean) => void
  /** PointerDown handler for drag-to-resize — when provided, a drag strip is rendered inside the edit toolbar */
  onResizePointerDown?: (e: React.PointerEvent) => void
}

/**
 * Compact inline editor for the MVK panel — matches MarkdownEditor visual style.
 * Toolbar lives outside the scrollable content area so it is always visible.
 */
export default function InlineEditor({
  content = '',
  placeholder = '',
  hint = null,
  editPlaceholder,
  onSave,
  isEditing: isEditingProp,
  onEditChange,
  onResizePointerDown,
}: Props) {
  const [isEditingInternal, setIsEditingInternal] = useState(false)
  // Use controlled state when parent provides it, otherwise use internal state
  const isEditing = isEditingProp !== undefined ? isEditingProp : isEditingInternal
  function setIsEditing(v: boolean) {
    setIsEditingInternal(v)
    onEditChange?.(v)
  }
  const [draft, setDraft] = useState(content)
  const [viewMode, setViewMode] = useState<'code' | 'preview'>('code')
  const [showHelp, setShowHelp] = useState(false)
  const { setDirty } = useDirtyState()

  // Report dirty state whenever draft diverges from saved content while editing
  useEffect(() => {
    if (isEditing) {
      setDirty(draft !== content)
    }
  }, [draft, isEditing, content, setDirty])

  // Clear dirty state on unmount (safety net for navigation that bypasses guards)
  useEffect(() => {
    return () => setDirty(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function startEdit() {
    setDraft(content)
    setViewMode('code')
    setIsEditing(true)
  }

  function handleSave() {
    setDirty(false)
    onSave(draft)
    setIsEditing(false)
  }

  function handleCancel() {
    setDraft(content)
    setDirty(false)
    setIsEditing(false)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Tab') {
      e.preventDefault()
      const ta = e.currentTarget
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const newVal = draft.substring(0, start) + '  ' + draft.substring(end)
      setDraft(newVal)
      setTimeout(() => {
        ta.selectionStart = ta.selectionEnd = start + 2
      }, 0)
    }
  }

  if (!isEditing) {
    return (
      <div className="relative bg-white overflow-hidden flex flex-col h-full">
        {/* Drag strip — thin resize handle only, no full bar */}
        {onResizePointerDown && (
          <div
            onPointerDown={onResizePointerDown}
            className="flex-shrink-0 h-3 cursor-ns-resize flex items-center justify-center group/handle select-none touch-none"
            aria-hidden="true"
          >
            <div className="w-8 h-0.5 rounded-full bg-gray-200 group-hover/handle:bg-gray-300 transition-colors duration-150" />
          </div>
        )}
        {/* Floating Edit button — positioned where it sat in the former top bar */}
        <button
          onClick={startEdit}
          className="absolute top-2 right-4 z-10 text-xs font-medium px-2.5 py-1 border border-gray-200 rounded bg-transparent text-blue-600 hover:border-blue-300 hover:text-blue-700 transition-colors"
        >
          Edit
        </button>
        {/* Scrollable content fills full height */}
        <div className="flex-1 min-h-0 px-4 pt-2 pb-3 overflow-auto overscroll-none">
          {content ? (
            <div className="prose prose-xs prose-neutral max-w-none text-sm">
              <ReactMarkdown
                remarkPlugins={MD_PLUGINS.remark}
                rehypePlugins={MD_PLUGINS.rehype}
                components={mdComponents}
              >
                {content}
              </ReactMarkdown>
            </div>
          ) : (
            <div className="prose prose-sm prose-neutral max-w-none">
              {hint ?? (
                <p className="text-xs text-gray-400 italic m-0">
                  {placeholder || 'No MVK notes. Click Edit to add.'}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white overflow-hidden flex flex-col h-full">
      {/* Unified edit-mode header: drag affordance overlaid at top, controls centered in full height */}
      <div className="relative flex items-center flex-shrink-0 bg-white border-b border-gray-100 h-10 px-4">
        {/* Drag sub-strip — absolute overlay at top edge; buttons remain centered in full h-10 */}
        {onResizePointerDown && (
          <div
            onPointerDown={onResizePointerDown}
            className="absolute top-0 left-0 right-0 h-2 cursor-ns-resize flex items-center justify-center group/editdrag select-none touch-none"
            aria-hidden="true"
          >
            <div className="w-8 h-0.5 rounded-full bg-gray-200 group-hover/editdrag:bg-gray-300 transition-colors duration-150" />
          </div>
        )}
        {/* Controls row — full width, vertically centered in h-10 */}
        <div className="flex items-center w-full">
          <div className="flex gap-0.5">
            {(['code', 'preview'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`text-xs px-2.5 py-1 rounded font-medium capitalize transition-colors ${
                  viewMode === mode
                    ? 'bg-white text-gray-900 shadow-sm border border-gray-200'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setShowHelp(true)}
              className="text-xs text-gray-500 hover:text-blue-600 font-medium transition-colors"
              aria-label="Markdown Help"
              title="Markdown Help"
            >
              <span className="hidden sm:inline">Markdown Help</span>
              <span className="sm:hidden inline-flex items-center justify-center w-5 h-5 rounded border border-gray-200 text-gray-500 text-[11px] font-bold leading-none" aria-hidden="true">?</span>
            </button>
            <div className="w-px h-3.5 bg-gray-200 flex-shrink-0" />
            <button
              onClick={handleCancel}
              className="text-xs text-gray-500 hover:text-gray-700 font-medium px-2.5 py-1 border border-gray-200 rounded bg-white transition-colors"
              title="Cancel"
            >
              <span className="hidden sm:inline">Cancel</span>
              <span className="sm:hidden" aria-hidden="true">✕</span>
            </button>
            <button
              onClick={handleSave}
              className="text-xs bg-blue-600 text-white font-medium px-2.5 py-1 rounded hover:bg-blue-700 transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      </div>
      {showHelp && <MarkdownHelpPanel onClose={() => setShowHelp(false)} />}
      {viewMode === 'code' ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full px-4 py-3 text-sm font-mono text-gray-800 focus:outline-none resize-none leading-relaxed overflow-y-auto overscroll-none flex-1 min-h-0"
          rows={4}
          placeholder={editPlaceholder ?? placeholder}
          autoFocus
        />
      ) : (
        <div className="px-4 py-3 overflow-auto overscroll-none flex-1 min-h-0 prose prose-xs prose-neutral max-w-none text-sm">
          {draft ? (
            <ReactMarkdown
              remarkPlugins={MD_PLUGINS.remark}
              rehypePlugins={MD_PLUGINS.rehype}
              components={mdComponents}
            >
              {draft}
            </ReactMarkdown>
          ) : (
            <p className="text-gray-400 italic text-sm m-0">Nothing to preview.</p>
          )}
        </div>
      )}
    </div>
  )
}
