'use client'

import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import MarkdownHelpPanel from './MarkdownHelpPanel'
import { useDirtyState } from '@/components/providers/DirtyStateProvider'
import { MD_PLUGINS, mdComponents } from '@/lib/md-config'

export const MVK_EDIT_PLACEHOLDER = `The MVK should help your future self quickly recover the idea without rereading your notes or researching it all over again.

Suggested structure:

  Index — The smallest useful reminder of the concept.
  Context — The background needed to understand the concept again if you forget it.
  Intuition — A simple example, diagram, analogy, image, or mental model that makes it click again.

Keep it compact for quick recovery. Use Notes for deeper explanations.`

export const NOTES_EDIT_PLACEHOLDER = `Use Notes to preserve the deeper understanding.

Suggested structure:

  Core — The meaning or reasoning behind the concept.
  Context — The larger background needed to understand the concept in depth.
  Intuition — Examples, diagrams, analogies, images, or mental models that make the concept clear.

Save the explanation that helped the concept make sense.`

export const REFS_EDIT_PLACEHOLDER = `Use References to save source material.

Suggested structure:

  Source — Author, book, article, video, website, or other reference material.
  Location — Page number, section, timestamp, URL, etc.`

export const REFS_GUIDANCE_DISPLAY = (
  <div className="py-1 space-y-4">
    <p className="text-sm text-gray-500 leading-relaxed m-0">
      Use <span className="font-semibold text-gray-600">References</span> to save source material.
    </p>
    <div className="space-y-3">
      <p className="text-[11px] text-gray-400 uppercase tracking-widest m-0 font-medium">Suggested structure</p>
      <div className="pl-3 border-l-2 border-orange-200">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-orange-400">Source</span>
        <p className="text-xs text-gray-400 m-0 mt-0.5 leading-relaxed">Author, book, article, video, website, or other reference material.</p>
      </div>
      <div className="pl-3 border-l-2 border-orange-200">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-orange-400">Location</span>
        <p className="text-xs text-gray-400 m-0 mt-0.5 leading-relaxed">Page number, section, timestamp, URL, etc.</p>
      </div>
    </div>
  </div>
)

export const NOTES_GUIDANCE_DISPLAY = (
  <div className="py-1 space-y-4">
    <p className="text-sm text-gray-500 leading-relaxed m-0">
      Use <span className="font-semibold text-gray-600">Notes</span> to preserve the deeper understanding.
    </p>
    <div className="space-y-3">
      <p className="text-[11px] text-gray-400 uppercase tracking-widest m-0 font-medium">Suggested structure</p>
      <div className="pl-3 border-l-2 border-emerald-200">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-emerald-500">Core</span>
        <p className="text-xs text-gray-400 m-0 mt-0.5 leading-relaxed">The meaning or reasoning behind the concept.</p>
      </div>
      <div className="pl-3 border-l-2 border-emerald-200">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-emerald-500">Context</span>
        <p className="text-xs text-gray-400 m-0 mt-0.5 leading-relaxed">The larger background needed to understand the concept in depth.</p>
      </div>
      <div className="pl-3 border-l-2 border-emerald-200">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-emerald-500">Intuition</span>
        <p className="text-xs text-gray-400 m-0 mt-0.5 leading-relaxed">Examples, diagrams, analogies, images, or mental models that make the concept clear.</p>
      </div>
    </div>
    <div className="border-t border-gray-100 pt-3">
      <p className="text-xs text-gray-400 m-0 leading-relaxed">
        Save the explanation that helped the concept make sense.
      </p>
    </div>
  </div>
)

export const MVK_GUIDANCE_DISPLAY = (
  <div className="py-1 space-y-4">
    <p className="text-sm text-gray-500 leading-relaxed m-0">
      The <span className="font-semibold text-gray-600">MVK</span> should help your future self quickly recover the concept without rereading your notes or researching it all over again.
    </p>
    <div className="space-y-3">
      <p className="text-[11px] text-gray-400 uppercase tracking-widest m-0 font-medium">Suggested structure</p>
      <div className="pl-3 border-l-2 border-blue-200">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-blue-500">Index</span>
        <p className="text-xs text-gray-400 m-0 mt-0.5 leading-relaxed">The smallest useful reminder of the concept.</p>
      </div>
      <div className="pl-3 border-l-2 border-blue-200">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-blue-500">Context</span>
        <p className="text-xs text-gray-400 m-0 mt-0.5 leading-relaxed">The background needed to understand the concept again if you forget it.</p>
      </div>
      <div className="pl-3 border-l-2 border-blue-200">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-blue-500">Intuition</span>
        <p className="text-xs text-gray-400 m-0 mt-0.5 leading-relaxed">A simple example, diagram, analogy, image, or mental model that makes it click again.</p>
      </div>
    </div>
    <div className="border-t border-gray-100 pt-3">
      <p className="text-xs text-gray-400 m-0 leading-relaxed">
        Keep it compact for quick recovery. Use <span className="font-medium text-gray-500">Notes</span> for deeper explanations.
      </p>
    </div>
  </div>
)

interface Props {
  content?: string
  placeholder?: string
  hint?: React.ReactNode
  editPlaceholder?: string
  onSave: (value: string) => void
}

/**
 * Full markdown editor with Code/Preview toggle.
 * Instead of calling a store action directly, calls onSave(value) so callers
 * can wire it to a TanStack Query mutation.
 */
export default function MarkdownEditor({
  content = '',
  placeholder = '',
  hint = null,
  editPlaceholder,
  onSave,
}: Props) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState('')
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
    setDirty(false)
    setIsEditing(false)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Backspace') {
      // Stop Backspace from bubbling to the document-level keyboard handler in
      // ConceptView, which would trigger back navigation. Without this, if the
      // user holds Backspace while clicking Save, the textarea unmounts and the
      // browser fires another keydown on the body — bypassing the textarea guard
      // in the document listener and causing an unintended router.back().
      e.stopPropagation()
    }
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
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex justify-end px-4 py-2 border-b border-gray-100">
          <button
            onClick={startEdit}
            className="text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
          >
            Edit
          </button>
        </div>
        <div className="p-4 prose prose-sm prose-neutral max-w-none min-h-[64px] overflow-x-auto">
          {content ? (
            <ReactMarkdown
              remarkPlugins={MD_PLUGINS.remark}
              rehypePlugins={MD_PLUGINS.rehype}
              components={mdComponents}
            >
              {content}
            </ReactMarkdown>
          ) : (
            <div>
              {hint ?? (
                <p className="text-gray-400 italic text-sm m-0">
                  {placeholder || 'No content yet. Click Edit to add.'}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-gray-50">
        <div className="flex gap-1">
          {(['code', 'preview'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`text-xs px-3 py-1 rounded-md font-medium capitalize transition-colors ${
                viewMode === mode
                  ? 'bg-white text-gray-900 shadow-sm border border-gray-200'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowHelp(true)}
            className="text-xs text-gray-400 hover:text-emerald-500 font-medium transition-colors"
            aria-label="Markdown Help"
            title="Markdown Help"
          >
            <span className="hidden sm:inline">Markdown Help</span>
            <span className="sm:hidden inline-flex items-center justify-center w-5 h-5 rounded border border-gray-200 text-gray-400 text-[11px] font-bold leading-none" aria-hidden="true">?</span>
          </button>
          <div className="flex gap-2">
            <button
              onClick={handleCancel}
              className="text-xs text-gray-500 hover:text-gray-700 font-medium px-3 py-1 border border-gray-200 rounded-md bg-white"
              title="Cancel"
            >
              <span className="hidden sm:inline">Cancel</span>
              <span className="sm:hidden" aria-hidden="true">✕</span>
            </button>
            <button
              onClick={handleSave}
              className="text-xs bg-blue-600 text-white font-medium px-3 py-1 rounded-md hover:bg-blue-700"
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
          className="w-full p-4 text-sm font-mono text-gray-800 focus:outline-none resize-none leading-relaxed"
          rows={14}
          placeholder={editPlaceholder ?? placeholder}
          autoFocus
        />
      ) : (
        <div className="p-4 prose prose-sm prose-neutral max-w-none min-h-[80px] overflow-x-auto">
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
