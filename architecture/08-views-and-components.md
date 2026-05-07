# 08 — Views & Components

## The App Shell

Every protected route (`/app/*`) renders inside the app shell, defined in `src/app/(app)/layout.tsx`. The shell consists of three persistent regions:

```
┌──────────────────────────────────────────────────────┐
│ StudySessionBar (fixed top, full width)              │
├──────────┬───────────────────────────────────────────┤
│          │                                           │
│ Sidebar  │  main#main-content                        │
│ (fixed   │  (scrollable — this is where pages render)│
│  left)   │                                           │
│          │                                           │
└──────────┴───────────────────────────────────────────┘
```

The sidebar and study bar **never unmount** on navigation — they persist across all app routes. Only the content inside `main#main-content` changes.

---

## The Views

### Home (`/app`)

**File:** `src/app/(app)/app/page.tsx`

Simple welcome page. Shows a "New Concept" button and a brief intro. When the user has no concepts, this is the entry point to create their first one. The "New Concept" button calls `openConceptForm()` from `useConceptForm()`.

---

### SubjectView (`/app/subjects/[subjectId]`)

**File:** `src/app/(app)/app/subjects/[subjectId]/page.tsx`

Displays all concepts belonging to a specific subject. The most feature-rich list view.

**Data hooks used:**
- `useConcepts()` — all concepts (filtered client-side by subject)
- `useSubjectSortMode(subjectId)` — current sort preference
- `useSubjectConceptOrder(subjectId)` — custom position order (when sort is 'custom')
- `useSetSubjectSortMode()` — to change the sort mode
- `useMoveConceptInSubject()` — to reorder concepts in custom mode

**Sort modes:**

| Mode | Behavior |
|------|---------|
| `alpha` | Alphabetical A-Z |
| `alpha_desc` | Alphabetical Z-A |
| `date_new` | Newest created first |
| `date_old` | Oldest created first |
| `reviews_high` | Most reviews first |
| `reviews_low` | Fewest reviews first |
| `custom` | User-defined order; arrows visible |

**Filter options:** topic, subtopic, tag, state, priority, pinned

**Custom sort arrows:** Only visible when mode is `'custom'` AND no filters are active. When filters are active, amber warning text explains why arrows are hidden (filtered results don't represent the full order).

**Keyboard shortcuts (when not inside an input):**

| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate rows |
| `Enter` | Open focused concept |
| `Space` | Toggle MVK drawer |
| `+` or `=` | Increment review count |
| `-` | Decrement review count |
| `Backspace` | Go back |

**Back navigation:** Saves scroll, focused concept ID, and filter state to sessionStorage before navigating to ConceptView. Restores on return.

---

### ConceptView (`/app/concepts/[conceptId]`)

**File:** `src/app/(app)/app/concepts/[conceptId]/page.tsx`

The full concept detail screen. Three expandable sections: MVK (blue tint), Notes, References — each with a MarkdownEditor.

**Data hooks:**
- `useConcept(id)` — single concept (seeded from list cache)
- `useUpdateConceptContent()` — saves changes from each editor
- `useUpdateConceptField()` — state, priority, pinned changes
- `useIncrementReview()` / `useDecrementReview()` — review counter

**Keyboard shortcuts:**

| Key | Action |
|-----|--------|
| `Backspace` | Navigate back (guarded by DirtyStateProvider if dirty) |
| `+` or `=` | Increment review |
| `-` | Decrement review |

**Dirty state guard:** If any of the three MarkdownEditors has unsaved content, navigating away shows `UnsavedChangesDialog`. The `Backspace` key respects this via `requestNavigation()`.

On mount, `closeConceptForm()` is called — this drops the backdrop that ConceptFormProvider shows during the navigation transition from create form.

---

### ListMode / Library (`/app/library`)

**File:** `src/app/(app)/app/library/page.tsx`

All concepts, searchable and filterable. Client-side name search (no server call per keystroke).

**Data hooks:**
- `useConcepts()` — all concepts
- `useSubjects()`, `useTopics()`, `useSubtopics()`, `useTags()` — for filter dropdowns
- `useFilterSort()` — client-side filter/sort state

**Filter options:** subject, topic, subtopic, tag, state, priority, pinned

**Search:** Text input filters by concept name (case-insensitive substring match). Purely client-side — no debounce needed since no network call.

**Keyboard shortcuts:** Same as SubjectView (`↑↓`, `Enter`, `Space`, `+/-`, `Backspace`).

**Back navigation:** Same sessionStorage pattern as SubjectView.

---

### FocusMode (`/app/focus`)

**File:** `src/app/(app)/app/focus/page.tsx`

One concept at a time in a carousel style. Each section (MVK, Notes, References) has a "Reveal" button to progressively show content — useful for self-testing.

**Data hooks:**
- `useConcepts()` with `useFilterSort()` for the concept list
- `useIncrementReview()` / `useDecrementReview()` — inline review

**URL state:** `?id=conceptId` preserves the current concept across back-navigation. If you visit ConceptView and come back, FocusMode reopens at the same concept.

**Keyboard shortcuts:**

| Key | Action |
|-----|--------|
| `←` | Previous concept |
| `→` | Next concept |
| `+` / `-` | Review count |

---

### IndexMode (`/app/index`)

**File:** `src/app/(app)/app/index/page.tsx`

Alphabetical pill grid. All concepts displayed as clickable name pills, grouped A-Z with a `#` group for non-alphabetic concepts.

**Layout:** 5-column grid on desktop, responsive. Each letter group has a header.

**Two-click navigation:** First click focuses the pill (keyboard outline). Second click navigates to ConceptView. This prevents accidental navigations when scanning the index.

**Keyboard navigation (grid-aware):**

| Key | Action |
|-----|--------|
| `←` / `→` | Previous / next pill in same row |
| `↑` | Nearest pill on row above (by horizontal overlap — not just prev) |
| `↓` | Nearest pill on row below |
| `Space` | Open MVK drawer |
| `Enter` | Navigate to ConceptView |
| `+` / `-` | Review count |

The `↑↓` navigation finds the **nearest pill by horizontal center overlap**, not just the sequential previous/next pill. This gives a natural visual grid feeling even when rows have different numbers of pills.

**Back navigation:** Same sessionStorage pattern.

---

### OverviewView (`/app/overview`)

**File:** `src/app/(app)/app/overview/page.tsx`

A Server Component — no client-side data fetching. Fetches data directly in the page function using Server Actions.

**Three sections:**

1. **Study** — total minutes studied, total sessions, total reviews across all concepts
2. **Inventory** — state distribution bar chart, recent concepts
3. **Catalog** — subjects with concept counts, topics, tags

Because it's a Server Component, there are no keyboard shortcuts or interactive filters. It's a read-only dashboard.

---

### SessionsPage (`/app/sessions`)

**File:** `src/app/(app)/app/sessions/page.tsx`

Chronological list of study sessions. Newest first.

**Data hooks:**
- `useStudySessions()` — all sessions
- `useSubjects()` — for the subject selector in `EditSessionModal`
- `useUpdateStudySession()` — optimistic update on edit
- `useDeleteStudySession()` — optimistic removal on delete

**Actions per row:**
- **Edit** → opens `EditSessionModal` (change minutes, change subject)
- **Delete** → opens `DeleteSessionDialog` (confirmation required)

---

## UI Components

### `Sidebar` (`src/components/ui/Sidebar.tsx`)

Fixed left navigation panel. On desktop: always visible, collapsible to icon-only. On mobile: hidden by default, opens as an overlay.

**Key behaviors:**
- Collapse toggle (chevron button) shrinks sidebar to icon-only width
- Subject list shows all user subjects sorted alphabetically, each linking to SubjectView
- "New Concept" button calls `openConceptForm()` (guarded by DirtyState)
- Navigation links call `requestNavigation()` (guarded by DirtyState)
- On mobile: closes when the route changes (via `useEffect` on `pathname`)
- Calls `sessionStorage.removeItem('cv-back')` on navigation — ensures the list view doesn't trigger a stale back-restore when navigating forward

### `StudySessionBar` (`src/components/ui/StudySessionBar.tsx`)

Fixed top bar spanning the full width.

**Features:**
- Elapsed time counter (starts at 0, accumulates as user logs sessions)
- Quick-add buttons: +15m, +30m, +1h, +2h
- Subject selector dropdown (optional — sessions can be unlinked from a subject)
- On mobile: renders the hamburger button that opens the sidebar

### `ConceptForm` (`src/components/ui/ConceptForm.tsx`)

Modal for creating and editing concepts.

**Fields:**
- Name (text input, required)
- Subjects (CreatableMultiSelect — can create new subjects inline)
- Topics (CreatableMultiSelect)
- Tags (CreatableMultiSelect)

**Modes:**
- Create (`concept === null`): empty fields
- Edit (`concept !== null`): pre-filled with existing values

**Behaviors:**
- Mobile keyboard awareness: tracks `visualViewport` resize events to adjust modal height when the on-screen keyboard appears
- Backdrop click closes (unless submitting)
- Tab navigation between fields
- Submit calls `createConcept` or `updateConcept` based on mode, then calls `onDone(id)`

### `MarkdownEditor` (`src/components/ui/MarkdownEditor.tsx`)

Dual-mode editor: **Edit** (textarea) ↔ **Preview** (rendered markdown).

**In edit mode:**
- Textarea with tab-expansion (Tab inserts 2 spaces, does NOT change focus)
- Backspace event stops propagation — prevents document-level back-navigation from triggering while typing
- Dirty state integration: registers with DirtyStateProvider while editing
- Save button: calls `onSave(draft)` prop
- Cancel button: reverts draft, clears dirty state

**In preview mode:**
- Renders via `react-markdown` with the full plugin stack from `src/lib/md-config.tsx`
- Syntax highlighting, math (KaTeX), Mermaid diagrams, GFM tables
- `@tailwindcss/typography` `prose` class for styled output

**Markdown config** (`src/lib/md-config.tsx`):

```typescript
export const MD_PLUGINS = {
  remarkPlugins: [remarkGfm, remarkMath, remarkMark],  // remarkMark = custom ==highlight== plugin
  rehypePlugins: [rehypeKatex],
}

export const mdComponents = {
  // Mermaid fenced code blocks render as MermaidDiagram
  code({ node, className, children, ...props }) {
    const lang = /language-(\w+)/.exec(className || '')?.[1]
    if (lang === 'mermaid') {
      return <MermaidDiagram chart={String(children)} />
    }
    return <code className={className} {...props}>{children}</code>
  },
}
```

The `remarkMark` plugin adds `==highlighted text==` syntax → `<mark>highlighted text</mark>`.

### `MermaidDiagram` (`src/components/ui/MermaidDiagram.tsx`)

Renders Mermaid diagrams client-side. Uses **dynamic import** to avoid loading the Mermaid library during SSR (it's browser-only):

```typescript
const mermaid = dynamic(() => import('mermaid'), { ssr: false })
```

Shows a loading state while the library loads, and an error state if the diagram syntax is invalid.

### `MvkDrawer` (`src/components/ui/MvkDrawer.tsx`)

Floating panel showing the MVK content of the focused concept. Triggered by pressing `Space` in SubjectView, Library, or IndexMode.

**Key features:**
- **Resizable height**: user drags the top edge. Height persisted to `localStorage` under key `'mvk-panel-height'`. Restored on next open.
- Uses `InlineEditor` for editing — allows saving MVK without leaving the list view
- `pointer-events` based drag: `pointerdown` → `pointermove` → `pointerup` with cleanup

### `InlineEditor` (`src/components/ui/InlineEditor.tsx`)

Compact editor used inside MvkDrawer. Edit/preview toggle in a smaller footprint than MarkdownEditor. Same markdown rendering stack.

### `FilterSortBar` (`src/components/ui/FilterSortBar.tsx`)

Controls bar for filtering and sorting concepts.

**Filter types:**
- **Multi-select dropdowns**: Subjects, Topics, Tags (select one or more)
- **Enum selects**: States (NEW, LEARNING, etc.) with colored dots, Priorities with colored dots
- **Pinned toggle**: show only pinned concepts

**Sort select:** One of the 7 sort modes.

**Result count display:** "Showing X of Y concepts" — `aria-live="polite"` for accessibility.

**"Clear all" link:** Appears when any filter is active; calls `clearFilters()`.

### `StatusBadge` (`src/components/ui/StatusBadge.tsx`)

Exports four interactive pill/badge components:

**`StateSelector`** — Dropdown to change concept state (NEW, LEARNING, REVIEWING, MEMORIZING, STORED). Each state has a defined color pair.

**`PriorityBadge`** — Dropdown to change priority (LOW, MEDIUM, HIGH).

**`ReviewCounter`** — Displays review count with `+` and `-` buttons. Calls `useIncrementReview()` / `useDecrementReview()`.

**`PinButton`** — Toggle button showing a pin icon. Calls `useUpdateConceptField('pinned', ...)`.

**Dropdown isolation:** All dropdown-style components dispatch a custom event `'tiq:dropdown'` with their ID when opening. Other dropdowns listen and close themselves:

```typescript
// On open:
window.dispatchEvent(new CustomEvent('tiq:dropdown', { detail: { id: myId } }))

// On mount:
window.addEventListener('tiq:dropdown', (e) => {
  if (e.detail.id !== myId) setOpen(false)  // close if another opened
})
```

This ensures only one dropdown is open at a time without a global state manager.

### `CreatableMultiSelect` (`src/components/ui/CreatableMultiSelect.tsx`)

Multi-select with "create new" inline option. Used in ConceptForm for Subjects, Topics, Tags.

**Features:**
- Renders selected items as dismissible chips
- Dropdown shows matching options + "Create 'X'" option when typed value doesn't match
- Dropdown renders in a **portal** (`document.body`) to avoid z-index clipping inside the modal
- Full keyboard navigation: Tab through chips, Delete to remove, Arrow keys in dropdown, Enter to select

### `ShortcutsHintBar` (`src/components/ui/ShortcutsHintBar.tsx`)

Displays keyboard shortcut hints at the bottom of the screen. Hidden on mobile (using Tailwind's `hidden md:flex`). Shows context-appropriate hints based on the active view.

### Dialog Components

**`UnsavedChangesDialog`** — Rendered by DirtyStateProvider when navigation is blocked by dirty editors. "Keep Editing" vs "Discard Changes".

**`DeleteConceptDialog`** — Confirmation modal before deleting a concept. Shows concept name. Calls `useDeleteConcept()`.

**`DeleteSessionDialog`** — Confirmation modal before deleting a study session.

**`EditSessionModal`** — Edit modal for study sessions. Fields: minutes (number input), subject (dropdown). Calls `useUpdateStudySession()`.

---

## Keyboard Navigation Architecture

Views with keyboard navigation (`SubjectView`, `Library`, `IndexMode`, `FocusMode`) follow a consistent pattern:

1. **A `focusedId` state** tracks which concept is "active" for keyboard purposes (visual highlight, without browser focus)
2. **A `useEffect`** with `keydown` listener on `document` (not on a specific element):

```typescript
useEffect(() => {
  const handleKey = (e: KeyboardEvent) => {
    // Don't steal keys when user is typing in inputs
    if (e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement) return

    switch (e.key) {
      case 'ArrowDown': moveFocus(1); break
      case 'ArrowUp': moveFocus(-1); break
      case 'Enter': openConcept(focusedId); break
      case ' ': toggleMvkDrawer(); e.preventDefault(); break
      case '+': case '=': incrementReview(focusedId); break
      case '-': decrementReview(focusedId); break
      case 'Backspace': router.back(); break
    }
  }
  document.addEventListener('keydown', handleKey)
  return () => document.removeEventListener('keydown', handleKey)
}, [focusedId, ...])
```

3. **The "outside inputs" guard** (`e.target instanceof HTMLInputElement`) prevents keyboard shortcuts from firing while the user types in search boxes, filter inputs, or editors.

4. **MarkdownEditor backspace guard**: Inside a textarea, `Backspace` fires but the MarkdownEditor stops propagation, preventing the view's back-navigation from triggering while editing.

---

## Subject Color System (`src/lib/subject-colors.ts`)

Subjects get deterministic badge colors based on their alphabetical position in the user's subject list:

```typescript
export const SUBJECT_COLORS = [
  'bg-sky-50 text-sky-700 border-sky-200',
  'bg-violet-50 text-violet-700 border-violet-200',
  'bg-emerald-50 text-emerald-700 border-emerald-200',
  // ... 7 total
]

export function getSubjectColor(subjectId: string, subjects: Subject[]): string {
  const sorted = [...subjects].sort((a, b) => a.name.localeCompare(b.name))
  const idx = sorted.findIndex((s) => s.id === subjectId)
  return SUBJECT_COLORS[idx % SUBJECT_COLORS.length]
}
```

The color is stable: sorting alphabetically means "Mathematics" always gets the same color regardless of when it was created. The 7-color cycle ensures variety without repetition for small subject counts.

---

## Landing Page Components (`src/components/landing/`)

**`FeaturesSection`** — Feature showcase with screenshots from `public/landing-features/`. Static marketing content.

**`IdeaSection`** — Marketing section explaining the MVK concept. Static.

**`GuestLink`** (`src/components/landing/GuestLink.tsx`) — The "Try as Guest" call to action:
- On click: calls `createGuestUser()` Server Action
- Stores `{ email, password, createdAt }` in `localStorage`
- Calls `signIn('credentials', { email, password })` → JWT session
- On subsequent visits: checks localStorage, re-uses credentials if < 30 days old
- Shows "Continue as Guest" if credentials exist; "Try as Guest" if not
