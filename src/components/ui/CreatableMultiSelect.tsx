'use client'

import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import { createPortal } from 'react-dom'

export interface CreatableMultiSelectHandle {
  focus: () => void
}

interface Props {
  label: string
  required?: boolean
  options?: string[]
  selected?: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  onTabNext?: () => void
  single?: boolean
}

const CreatableMultiSelect = forwardRef<CreatableMultiSelectHandle, Props>(function CreatableMultiSelect({
  label,
  required = false,
  options = [],
  selected = [],
  onChange,
  placeholder = 'Select or type to create...',
  onTabNext,
  single = false,
}: Props, ref) {
  const isFull = single && selected.length >= 1
  const [input, setInput] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 })

  const triggerRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useImperativeHandle(ref, () => ({
    focus: () => triggerRef.current?.focus(),
  }))

  const filtered = options.filter(
    (opt) =>
      opt.toLowerCase().includes(input.toLowerCase()) && !selected.includes(opt)
  )

  const canCreate =
    input.trim().length > 0 &&
    !options.find((o) => o.toLowerCase() === input.trim().toLowerCase()) &&
    !selected.includes(input.trim())

  const hasItems = filtered.length > 0 || canCreate

  const updatePos = useCallback(() => {
    if (!triggerRef.current) return
    const r = triggerRef.current.getBoundingClientRect()
    setDropdownPos({ top: r.bottom + 4, left: r.left, width: r.width })
  }, [])

  useEffect(() => {
    if (!isOpen) return
    updatePos()
    window.addEventListener('scroll', updatePos, true)
    window.addEventListener('resize', updatePos)
    return () => {
      window.removeEventListener('scroll', updatePos, true)
      window.removeEventListener('resize', updatePos)
    }
  }, [isOpen, updatePos])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const inTrigger = triggerRef.current?.contains(e.target as Node)
      const inDropdown = dropdownRef.current?.contains(e.target as Node)
      if (!inTrigger && !inDropdown) setIsOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function open() {
    if (isFull) return
    updatePos()
    setIsOpen(true)
    requestAnimationFrame(() => searchInputRef.current?.focus())
    setTimeout(() => {
      triggerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 150)
  }

  function add(value: string) {
    onChange([...selected, value])
    setInput('')
    setIsOpen(false)
  }

  function remove(value: string) {
    onChange(selected.filter((s) => s !== value))
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered.length > 0 && filtered[0].toLowerCase() === input.toLowerCase()) {
        add(filtered[0])
      } else if (canCreate) {
        add(input.trim())
      } else if (filtered.length > 0) {
        add(filtered[0])
      }
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      if (input.trim()) {
        if (filtered.length > 0 && filtered[0].toLowerCase() === input.trim().toLowerCase()) {
          add(filtered[0])
        } else if (canCreate) {
          add(input.trim())
        } else if (filtered.length > 0) {
          add(filtered[0])
        } else {
          setInput('')
          setIsOpen(false)
        }
      } else {
        setIsOpen(false)
      }
      onTabNext?.()
    }
    if (e.key === 'Escape') {
      e.stopPropagation()
      setIsOpen(false)
      requestAnimationFrame(() => triggerRef.current?.focus())
    }
  }

  const dropdown = isOpen
    ? createPortal(
        <div
          ref={dropdownRef}
          style={{ top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width }}
          className="fixed bg-white border border-gray-100 rounded-lg shadow-xl z-[9999] overscroll-none"
        >
          {/* Search row */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
            <svg
              viewBox="0 0 16 16"
              fill="none"
              className="w-3.5 h-3.5 text-gray-400 flex-shrink-0"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="6.5" cy="6.5" r="4.5" />
              <path d="M10.5 10.5L14 14" />
            </svg>
            <input
              ref={searchInputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search or create..."
              className="flex-1 text-sm outline-none bg-transparent text-gray-800 placeholder:text-gray-400"
            />
          </div>

          {/* Options list */}
          <ul className="max-h-44 overflow-y-auto overscroll-none py-1">
            {filtered.map((opt) => (
              <li
                key={opt}
                onMouseDown={(e) => {
                  e.preventDefault()
                  add(opt)
                }}
                className="px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer"
              >
                {opt}
              </li>
            ))}
            {canCreate && (
              <li
                onMouseDown={(e) => {
                  e.preventDefault()
                  add(input.trim())
                }}
                className="px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50/60 cursor-pointer font-medium"
              >
                + Create &ldquo;{input.trim()}&rdquo;
              </li>
            )}
            {input.trim() && !hasItems && (
              <li className="px-3 py-1.5 text-sm text-gray-400 select-none">
                No results for &ldquo;{input.trim()}&rdquo;
              </li>
            )}
          </ul>
        </div>,
        document.body
      )
    : null

  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>

      <div
        ref={triggerRef}
        tabIndex={0}
        className={`min-h-[34px] border rounded-md px-2 py-1 flex flex-wrap gap-1 items-center transition-colors bg-white select-none focus:outline-none ${
          isFull
            ? 'border-gray-200 bg-gray-50 cursor-default'
            : isOpen
              ? 'border-blue-500 cursor-pointer'
              : 'border-gray-300 hover:border-gray-400 focus:border-blue-500 cursor-pointer'
        }`}
        onClick={open}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            open()
          }
        }}
      >
        {selected.map((s) => (
          <span
            key={s}
            className="flex items-center gap-1 bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full"
          >
            {s}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                remove(s)
              }}
              className="text-blue-400 hover:text-blue-700 leading-none transition-colors"
              aria-label={`Remove ${s}`}
            >
              <svg
                viewBox="0 0 10 10"
                fill="none"
                className="w-2 h-2"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M2 2l6 6M8 2L2 8" />
              </svg>
            </button>
          </span>
        ))}
        {selected.length === 0 && (
          <span className="flex-1 text-sm text-gray-400 py-0.5">{placeholder}</span>
        )}
        {isFull ? (
          <span className="text-xs text-gray-400 ml-auto italic">remove to change</span>
        ) : (
          <svg
            viewBox="0 0 10 6"
            fill="none"
            className={`w-2.5 h-2.5 text-gray-400 flex-shrink-0 ml-auto transition-transform ${isOpen ? 'rotate-180' : ''}`}
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M1 1l4 4 4-4" />
          </svg>
        )}
      </div>

      {dropdown}
    </div>
  )
})

export default CreatableMultiSelect
