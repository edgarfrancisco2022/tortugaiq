# CLAUDE.md — TortugaIQ Production App

This is the primary reference for Claude Code working on this app. Read it before writing any code.

---

## What Is TortugaIQ

TortugaIQ is a personal knowledge management app for long-term learning. The core unit is the **Concept** — a named piece of knowledge with:

- An **MVK** (Minimum Viable Knowledge): the smallest useful representation
- Full markdown notes and references
- Metadata: subjects, topics, tags, state, priority, review count, pin status

This is NOT a flashcard or spaced-repetition app. Users navigate their concepts manually and track their own progress. The design philosophy: simple, fast, long-term maintainable.

---

## Tech Stack

| Layer       | Choice                                                                                         |
| ----------- | ---------------------------------------------------------------------------------------------- |
| Framework   | Next.js 16.2.2, App Router, TypeScript (strict)                                                |
| Database    | PostgreSQL on Neon (serverless)                                                                |
| ORM         | Drizzle ORM + Drizzle Kit                                                                      |
| Auth        | Auth.js v5 (NextAuth) — JWT session strategy                                                   |
| Client data | TanStack Query v5                                                                              |
| Validation  | Zod                                                                                            |
| Styling     | Tailwind CSS v4 + @tailwindcss/typography (no tailwind.config.ts — configured via CSS imports) |
| Markdown    | react-markdown + remark-gfm + remark-math + rehype-katex + mermaid                             |
| Email       | Resend                                                                                         |
| Deploy      | Vercel                                                                                         |

---

## Setup & Commands

```bash
npm install
npm run dev                    # localhost:3000
npm run build
npm run lint

# Database
npx drizzle-kit generate      # generate migration after changing schema.ts
npx drizzle-kit migrate       # apply pending migrations to DATABASE_URL
npx drizzle-kit studio        # visual schema browser (optional)
```

### Required environment variables

```
DATABASE_URL=               # Neon connection string (pooled)
AUTH_SECRET=                # openssl rand -base64 32
AUTH_URL=                   # http://localhost:3000 (dev) | production URL (prod)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
RESEND_API_KEY=
CRON_SECRET=                # secret used to authenticate Vercel cron requests
```

---

## Data Model

### TypeScript Types (`src/lib/types.ts`)

```typescript
export type ConceptState =
  | "NEW"
  | "LEARNING"
  | "REVIEWING"
  | "MEMORIZING"
  | "STORED";
export type ConceptPriority = "LOW" | "MEDIUM" | "HIGH";
export type SubjectSortMode =
  | "alpha"
  | "alpha_desc"
  | "date_new"
  | "date_old"
  | "reviews_high"
  | "reviews_low"
  | "custom";

export interface Subject {
  id: string;
  userId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}
export interface Topic {
  id: string;
  userId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}
export interface Subtopic {
  id: string;
  userId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}
export interface Tag {
  id: string;
  userId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Concept {
  id: string;
  userId: string;
  name: string;
  mvkNotes: string;
  markdownNotes: string;
  referencesMarkdown: string;
  state: ConceptState;
  priority: ConceptPriority;
  reviewCount: number;
  pinned: boolean;
  createdAt: Date;
  updatedAt: Date;
  // Direct FKs (stored on concepts row)
  topicId: string | null;
  subtopicId: string | null;
  // Joined fields (populated by query, not stored in concepts table)
  subjectIds: string[];
  tagIds: string[];
  // Only populated by getConcept (single-concept queries)
  subjectNames?: string[];
  topicName?: string | null;
  subtopicName?: string | null;
  tagNames?: string[];
}

export interface StudySession {
  id: string;
  userId: string;
  minutes: number;
  subjectId: string | null;
  createdAt: Date;
}

// Input types for mutations (names not IDs — server resolves/creates)
export interface ConceptInput {
  name: string;
  subjectNames: string[];
  topicName: string | null;
  subtopicName: string | null;
  tagNames: string[];
  // Optional fields — used when creating with pre-filled content
  mvkNotes?: string;
  markdownNotes?: string;
  referencesMarkdown?: string;
  state?: ConceptState;
  priority?: ConceptPriority;
  pinned?: boolean;
}
```

### Database Tables (`src/db/schema.ts`)

| Table                    | Purpose                                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------------- |
| `users`                  | Auth.js adapter + `passwordHash`, `isGuest` (boolean, default false), `createdAt`/`updatedAt` extensions |
| `accounts`               | OAuth provider accounts (Auth.js)                                                                        |
| `sessions`               | Auth.js adapter table (present but not used for session lookups — JWT strategy)                          |
| `verification_tokens`    | Email verification (Auth.js)                                                                             |
| `password_reset_tokens`  | Password recovery flow                                                                                   |
| `subjects`               | User subjects — unique `(userId, name)` constraint                                                       |
| `topics`                 | User topics — unique `(userId, name)`                                                                    |
| `subtopics`              | User subtopics — unique `(userId, name)`; same shape as `topics`                                         |
| `tags`                   | User tags — unique `(userId, name)`                                                                      |
| `concepts`               | Core entity; `topic_id` and `subtopic_id` are nullable FKs (ON DELETE SET NULL) — many-to-one           |
| `concept_subjects`       | M:M concept ↔ subject (cascade delete)                                                                   |
| `concept_tags`           | M:M concept ↔ tag (cascade delete)                                                                       |
| `subject_concept_orders` | Custom sort positions per `(userId, subjectId, conceptId)`                                               |
| `subject_sort_modes`     | Sort mode preference per `(userId, subjectId)` — full 7-value enum matching `SubjectSortMode`            |
| `study_sessions`         | Study time log; `subjectId` FK is SET NULL on subject delete                                             |

Every user-owned table has `userId` as a non-nullable FK to `users.id ON DELETE CASCADE`.

---

## Routes

### Public

| Route                    | View               | Notes                                              |
| ------------------------ | ------------------ | -------------------------------------------------- |
| `/`                      | LandingPage        | Marketing page: hero, FeaturesSection, IdeaSection |
| `/notes`                 | NotesView          | Static blog list                                   |
| `/notes/[slug]`          | PostView           | Blog post                                          |
| `/privacy`               | PrivacyPage        | Static privacy policy                              |
| `/sign-in`               | SignInPage         | Credentials + Google                               |
| `/sign-up`               | SignUpPage         | Registration                                       |
| `/forgot-password`       | ForgotPasswordPage | Request reset email                                |
| `/forgot-password/reset` | ResetPasswordPage  | Token validation + new password                    |

### App (require auth — middleware redirects to /sign-in)

| Route                       | View         | Notes                                  |
| --------------------------- | ------------ | -------------------------------------- |
| `/app`                      | HomeView     | Welcome + "New Concept" CTA            |
| `/app/subjects/[subjectId]` | SubjectView  | Concepts in a subject                  |
| `/app/concepts/[conceptId]` | ConceptView  | Full concept detail                    |
| `/app/library`              | ListMode     | All concepts, searchable               |
| `/app/focus`                | FocusMode    | Flipcard carousel                      |
| `/app/index`                | IndexMode    | Alphabetical pill grid                 |
| `/app/overview`             | OverviewView | Stats dashboard (Server Component)     |
| `/app/sessions`             | SessionsPage | Study session history with edit/delete |

### App Shell Layout (`(app)/layout.tsx`)

Renders: `Sidebar` (fixed left, collapsible) + `StudySessionBar` (fixed top) + `main#main-content` (scrollable). `ConceptForm` modal rendered at shell level so it can be triggered from any view. All providers wrap the shell: `QueryProvider`, `SessionProvider`, `DirtyStateProvider`, `ConceptFormProvider`, `SidebarStateProvider`, `ViewStateRegistryProvider`.

---

## View Behaviors & Keyboard Shortcuts

### SubjectView (`/app/subjects/[subjectId]`)

- Sort modes: `alpha`, `alpha_desc`, `date_new`, `date_old`, `reviews_high`, `reviews_low`, `custom`
- Filters: topic, subtopic, tag, state, priority, pinned
- Keyboard (outside inputs): `↑↓` navigate rows, `Enter` open, `Space` toggle MVK drawer, `+/=` increment review, `-` decrement review, `Backspace` back
- Custom sort arrows only visible when mode is `custom` AND no filters active; show amber warning when filters active
- Back navigation restores scroll, focused row, and filter state from `sessionStorage`

### ConceptView (`/app/concepts/[conceptId]`)

- Three sections: MVK (blue tint), Notes, References — each with MarkdownEditor (Code/Preview toggle)
- Keyboard: `Backspace` back, `+/=` increment review, `-` decrement review
- Navigating away while any editor is dirty triggers `UnsavedChangesDialog`

### ListMode / Library (`/app/library`)

- Client-side name search (no DB call on each keystroke)
- Sort: same 7-mode set as SubjectView
- Filters: subject, topic, subtopic, tag, state, priority, pinned
- Keyboard: same as SubjectView (`↑↓`, `Enter`, `Space` MVK, `+/-`, `Backspace`)
- Back navigation preserves state

### FocusMode (`/app/focus`)

- One concept at a time; Reveal buttons for MVK / Notes / References
- Keyboard: `←` prev, `→` next, `+/-` review
- URL state (`?id=`) preserves position across back-navigation

### IndexMode (`/app/index`)

- 5-column desktop grid, grouped alphabetically; `#` group for non-alphabetic (numeric sort within group)
- Two-click: first click focuses pill, second click opens ConceptView
- Keyboard: `←→↑↓` visual grid navigation (finds nearest pill on adjacent row by horizontal overlap), `Space` MVK, `+/-` review, `Enter` open
- Back navigation preserves state

### OverviewView (`/app/overview`)

- Three sections: Study (total time, sessions, reviews), Inventory (state distribution, recent), Catalog (subjects/topics/subtopics/tags with counts)
- Client Component; no keyboard shortcuts

### SessionsPage (`/app/sessions`)

- Lists all study sessions (newest first)
- Edit button opens `EditSessionModal` (change minutes + subject)
- Delete button opens `DeleteSessionDialog` (confirmation)
- Uses `useStudySessions`, `useUpdateStudySession`, `useDeleteStudySession`

### MvkDrawer

- Floating panel triggered by `Space` in SubjectView and ListMode
- Resizable; height persisted in `localStorage`
- Uses `InlineEditor` for inline editing without entering ConceptView

### Unsaved Changes Guard

- `DirtyStateProvider` tracks whether any `MarkdownEditor` has unsaved content
- Navigating away while dirty shows `UnsavedChangesDialog` (Stay / Leave)
- Browser `beforeunload` event is also guarded

### Back Navigation State (sessionStorage pattern)

SubjectView, ListMode, and IndexMode save state before navigating to ConceptView:

- `cv-back` — key presence signals returning from ConceptView
- `scroll-{view}` — scrollTop of `#main-content`
- `{view}-last-id` — focused concept ID
- `{view}-state` — serialized filters + sort

An in-memory flag `__cvBackPending` is set before writing sessionStorage to prevent stale storage from triggering restore on a fresh page load. On mount: if `cv-back` present → restore state + remove key; if absent → reset scroll to top. **This pattern must be preserved exactly.**

---

## Authentication (`src/auth.ts`)

- **JWT sessions** — strategy is `'jwt'`; the `sessions` table is present (Auth.js adapter) but session lookups use the JWT, not the DB table
- **Credentials provider** — `authorize()` looks up user by email (lowercased), compares bcrypt hash
- **Sign-up** — separate Server Action (`src/actions/auth.ts`) since Auth.js doesn't handle credentials sign-up
- **Password recovery** — `crypto.randomBytes(32)` hex token → `password_reset_tokens` (1h expiry) → Resend email → `/forgot-password/reset?token=...` → validate + `bcrypt.hash` new password
- **Middleware** (`src/middleware.ts`) — `auth()` check on `/app/*`; authenticated non-guests redirected away from `/sign-in` and `/sign-up`
- **Server Components** — `auth()` from `@/auth`
- **Client Components** — `useSession()` from `next-auth/react`; `session.user.id`, `session.user.isGuest`, and `session.user.guestCreatedAt` are always set via the JWT/session callbacks

### Guest User System

- `createGuestUser()` action creates `guest-{uuid}@demo.tortugaiq.com` with `isGuest: true`
- `GuestLink.tsx` on the landing page calls `createGuestUser()`, stores credentials in `localStorage`, and signs in; on return visits it re-uses stored credentials
- JWT callback embeds `isGuest` (boolean) and `guestCreatedAt` (epoch ms timestamp) into the token
- Vercel cron (`vercel.json`) runs `/api/cleanup-guests` daily at 03:00 UTC to hard-delete guest accounts older than 30 days; endpoint requires `Authorization: Bearer {CRON_SECRET}`

---

## Server Actions (`src/actions/`)

All data mutations and queries are Server Actions. No custom API routes for domain data.

### Security contract (mandatory in every action)

```typescript
const session = await auth();
if (!session?.user?.id) throw new Error("Unauthorized");
const userId = session.user.id;
// Every DB query: ...where(eq(table.userId, userId))
```

Never accept `userId` from the client. Never skip the ownership check.

### `concepts.ts`

| Action                                   | Description                                                                         |
| ---------------------------------------- | ----------------------------------------------------------------------------------- |
| `getConcepts()`                          | All user concepts with joined subject/topic/tag IDs                                 |
| `getConcept(id)`                         | Single concept + joined IDs and names                                               |
| `createConcept(input)`                   | Resolve-or-create subjects/topics/tags; insert concept + junctions; init sort order |
| `updateConcept(id, input)`               | Diff old vs new junctions; prune orphans                                            |
| `deleteConcept(id)`                      | Delete concept (FK cascade handles junctions); prune orphaned subjects/topics/tags  |
| `updateConceptField(id, field, value)`   | Patch `state`, `priority`, or `pinned`                                              |
| `updateConceptContent(id, field, value)` | Patch `mvkNotes`, `markdownNotes`, or `referencesMarkdown`                          |
| `incrementReview(id)`                    | `review_count + 1`                                                                  |
| `decrementReview(id)`                    | `GREATEST(0, review_count - 1)`                                                     |

### `subjects.ts`

This file owns subjects, topics, subtopics, and tags — all four are fetched here.

| Action                                                  | Description                                                                                     |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `getSubjects()`                                         | All subjects for user with concept count (LEFT JOIN aggregation)                                |
| `getTopics()`                                           | All topics for user, ordered by name                                                            |
| `getSubtopics()`                                        | All subtopics for user, ordered by name                                                         |
| `getTags()`                                             | All tags for user, ordered by name                                                              |
| `getSubjectSortMode(subjectId)`                         | Returns `SubjectSortMode`; defaults to `'alpha'` if not set                                     |
| `setSubjectSortMode(subjectId, mode)`                   | Upsert; if switching to `'custom'`, initialize `subject_concept_orders` with current date order |
| `getSubjectConceptOrder(subjectId)`                     | Concept IDs in position order                                                                   |
| `moveConceptInSubject(subjectId, conceptId, direction)` | Swap adjacent positions (`'up'` or `'down'`)                                                    |

### `study-sessions.ts`

| Action                                     | Description                                            |
| ------------------------------------------ | ------------------------------------------------------ |
| `getStudySessions()`                       | All sessions for current user, newest first            |
| `addStudySession({ minutes, subjectId? })` | Insert session                                         |
| `updateStudySession(id, input)`            | Patch `minutes` and/or `subjectId` (ownership checked) |
| `deleteStudySession(id)`                   | Delete session (ownership checked)                     |

### `auth.ts`

| Action                                             | Description                                                                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `signUpWithCredentials({ email, name, password })` | Validate → check duplicate → bcrypt hash → insert user → sign in                                                   |
| `requestPasswordReset({ email })`                  | Generate token → insert `password_reset_tokens` → send Resend email (always returns success, no email enumeration) |
| `resetPassword({ token, newPassword })`            | Validate token (exists, unexpired, unused) → bcrypt hash → update user → mark token used                           |
| `createGuestUser()`                                | Generate UUID-based credentials → insert user with `isGuest: true` → return `{ email, password }`                  |

---

## Client-Side Data (`src/hooks/`)

Server Components call Server Actions directly for initial render. Client Components use TanStack Query hooks defined in `src/hooks/`.

### Hook Inventory

| Hook                               | Description                                                                                                                |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `useConcepts()`                    | All user concepts from TQ cache                                                                                            |
| `useConcept(id)`                   | Single concept; seeded from list cache to avoid waterfall                                                                  |
| `useCreateConcept()`               | Creates concept; uses `refetchType: 'none'` on success to avoid race with `router.push`                                    |
| `useUpdateConcept()`               | Updates concept metadata                                                                                                   |
| `useUpdateConceptField()`          | Patches `state`/`priority`/`pinned` with optimistic update                                                                 |
| `useUpdateConceptContent()`        | Patches `mvkNotes`/`markdownNotes`/`referencesMarkdown`                                                                    |
| `useIncrementReview()`             | +1 `reviewCount`, optimistic                                                                                               |
| `useDecrementReview()`             | -1 `reviewCount` (floor 0), optimistic                                                                                     |
| `useDeleteConcept()`               | Deletes concept                                                                                                            |
| `useSubjects()`                    | Subjects with concept counts                                                                                               |
| `useTopics()`                      | All topics for user                                                                                                        |
| `useSubtopics()`                   | All subtopics for user                                                                                                     |
| `useTags()`                        | All tags for user                                                                                                          |
| `useSubjectSortMode(id)`           | Sort mode for a subject                                                                                                    |
| `useSetSubjectSortMode(id)`        | Set sort mode; invalidates order queries on change                                                                         |
| `useSubjectConceptOrder(id)`       | Custom concept order for a subject                                                                                         |
| `useMoveConceptInSubject(id)`      | Swap adjacent concept positions                                                                                            |
| `useStudySessions()`               | All study sessions                                                                                                         |
| `useAddStudySession()`             | Add session; invalidates sessions list                                                                                     |
| `useUpdateStudySession()`          | Edit session with optimistic update                                                                                        |
| `useDeleteStudySession()`          | Delete session with optimistic update                                                                                      |
| `useFilterSort(concepts, options)` | Local filter+sort state machine; returns `{ filtered, filters, sort, setFilter, setSort, clearFilters, hasActiveFilters }` |

### Optimistic update pattern

Used for `updateConceptField`, `incrementReview`, `decrementReview`, `useUpdateStudySession`, `useDeleteStudySession`:

```typescript
onMutate: async (input) => {
  await qc.cancelQueries({ queryKey: ['concepts'] })
  const prev = qc.getQueryData(['concepts'])
  qc.setQueryData(['concepts'], (old) => /* apply optimistic change */)
  return { prev }
},
onError: (_, __, ctx) => qc.setQueryData(['concepts'], ctx?.prev),
onSettled: () => qc.invalidateQueries({ queryKey: ['concepts'] }),
```

---

## Architectural Rules

1. **No userId from client** — `userId` is always read from the server session. Never passed from client.
2. **Per-user data isolation** — every domain query includes `where(eq(table.userId, userId))`. Hard requirement.
3. **Migration discipline** — always `drizzle-kit generate` + `drizzle-kit migrate`. Never `drizzle-kit push` after initial setup. The `src/db/migrations/` directory is committed to git.
4. **Server boundary** — Zod validation, DB access, and auth checks live in Server Actions only. No raw DB access from client components.
5. **Orphan pruning** — when a concept is deleted or its subjects/topics/tags are changed, prune subjects/topics/tags no longer referenced by any concept for that user.
6. **Sort order initialization** — when `setSubjectSortMode('custom')` is called for the first time on a subject, initialize `subject_concept_orders` with the current date-ordered concept list.
7. **No images** — the image feature is disabled. Do not add image storage until explicitly requested.
8. **UI consistency** — behavior regressions are not acceptable. Reference the `docs/updates/` folder for feature specs.
9. **Guest accounts expire** — `isGuest` users are automatically deleted after 30 days by the Vercel cron. Do not give guest users any special treatment beyond what `session.user.isGuest` already exposes.

---

## Migration Discipline

```bash
# After changing src/db/schema.ts:
npx drizzle-kit generate       # creates src/db/migrations/*.sql
# Review the generated SQL before applying
npx drizzle-kit migrate        # applies to DATABASE_URL

# Neon branching strategy:
# - .env.local DATABASE_URL → Neon "dev" branch
# - Vercel env vars → Neon "main" (production) branch
# - Always test migrations on dev branch first
```

`src/db/migrations/` is committed to git. It is the authoritative migration history.

---

## Component Inventory

All UI components are Client Components (`'use client'`) unless noted. They receive data as props and call TanStack Query hooks for mutations.

### UI Components (`src/components/ui/`)

| Component                  | Notes                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------ |
| `Sidebar.tsx`              | Fixed left nav; collapsible; subject links; sign-out                                             |
| `StudySessionBar.tsx`      | Fixed top bar; time presets (+15m, +30m, +1h, +2h); subject selector; wired to `addStudySession` |
| `ConceptForm.tsx`          | Create/edit concept modal; `createConcept`/`updateConcept`; uses `CreatableMultiSelect`          |
| `MarkdownEditor.tsx`       | Code/Preview toggle; integrates with `DirtyStateProvider`; no image support                      |
| `InlineEditor.tsx`         | Compact inline editor used inside `MvkDrawer`; resize affordance                                 |
| `MvkDrawer.tsx`            | Floating MVK panel; resizable (height in `localStorage`); uses `InlineEditor`                    |
| `FilterSortBar.tsx`        | Filter/sort dropdowns for SubjectView and ListMode                                               |
| `ShortcutsHintBar.tsx`     | Keyboard shortcut hints bar; hidden on mobile                                                    |
| `StatusBadge.tsx`          | Exports `StateSelector`, `PriorityBadge`, `ReviewCounter`, `PinButton`                           |
| `CreatableMultiSelect.tsx` | Multi-select with "create new" option; portal dropdown; keyboard navigation                      |
| `Logo.tsx`                 | Multi-variant logo (`nav`, `sidebar`, `auth`, `footer`, `decorative`, `error`)                   |
| `MarkdownHelpPanel.tsx`    | Syntax reference panel (Basics, Code, Math, Diagrams sections)                                   |
| `MermaidDiagram.tsx`       | Client-only Mermaid renderer; lazy-loads the mermaid library; error/loading states               |
| `UnsavedChangesDialog.tsx` | Blocks navigation when a MarkdownEditor has unsaved content                                      |
| `DeleteConceptDialog.tsx`  | Confirm-before-delete modal for concepts                                                         |
| `DeleteSessionDialog.tsx`  | Confirm-before-delete modal for study sessions                                                   |
| `EditSessionModal.tsx`     | Edit study session (minutes + subject)                                                           |

### Providers (`src/components/providers/`)

| Provider                        | Notes                                                                                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `QueryProvider.tsx`             | TanStack Query setup; `staleTime: 30s`, `refetchOnWindowFocus: false`                                                                                              |
| `SessionProvider.tsx`           | NextAuth `SessionProvider` wrapper                                                                                                                                 |
| `DirtyStateProvider.tsx`        | Tracks unsaved editor content; provides `isDirty`, `setDirty`, `requestNavigation`; renders `UnsavedChangesDialog`; guards `beforeunload`                          |
| `ConceptFormProvider.tsx`       | Global concept form modal state; cancels in-flight TQ queries before `router.push` to prevent race conditions (see `docs/bugs/redirect-new-concept-navigation.md`) |
| `SidebarStateProvider.tsx`      | Sidebar collapse boolean                                                                                                                                           |
| `ViewStateRegistryProvider.tsx` | Registers view state savers; allows views to persist scroll/focus before navigating                                                                                |

### Landing Components (`src/components/landing/`)

| Component             | Notes                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| `FeaturesSection.tsx` | Feature showcase with screenshots from `public/landing-features/`                                       |
| `IdeaSection.tsx`     | Marketing section explaining the MVK concept                                                            |
| `GuestLink.tsx`       | "Try as guest" CTA; calls `createGuestUser()`; stores credentials in `localStorage`; handles 30-day TTL |

---

## Utility Libraries (`src/lib/`)

| File                | Purpose                                                                                                                                        |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`          | TypeScript interfaces and type aliases                                                                                                         |
| `validations.ts`    | Zod schemas for all server action inputs                                                                                                       |
| `posts.ts`          | Blog post parsing (`getAllPosts`, `getPost`, `formatPostDate`) using Node `fs`                                                                 |
| `subject-colors.ts` | `SUBJECT_COLORS` array + `getSubjectColor(id)` for consistent badge colors                                                                     |
| `md-config.tsx`     | Centralized markdown config: custom `remarkMark` plugin (`==text==` highlight), `MD_PLUGINS` array, `mdComponents` map (Mermaid block support) |

---

## Markdown Support

Configured in `src/lib/md-config.tsx` and consumed by `MarkdownEditor` and other preview surfaces:

- `react-markdown` + `remark-gfm` (GFM tables, strikethrough, etc.)
- `remark-math` + `rehype-katex` (LaTeX math: `$inline$`, `$$block$$`)
- Custom `remarkMark` plugin — renders `==highlighted text==`
- Mermaid diagrams — fenced ` ```mermaid ` blocks rendered client-side via `MermaidDiagram.tsx`
- `@tailwindcss/typography` (`prose` class) for styled output

The `tiq-img://` scheme is NOT implemented. Images are disabled.

---

## Static Blog (Notes)

Posts in `src/posts/*.md` with YAML frontmatter (`title`, `date`). `src/lib/posts.ts` reads files with Node `fs` at build/request time. `NotesView` and `PostView` are static Server Components.

---

## Deployment

1. Create Vercel project; set root directory to repo root (leave empty)
2. Link Neon database via Vercel integration (auto-sets `DATABASE_URL`)
3. Set remaining env vars in Vercel project settings (including `CRON_SECRET`)
4. Configure OAuth callback URLs: `https://<domain>/api/auth/callback/google`, `.../facebook`
5. Run `npx drizzle-kit migrate` against production Neon branch before first deploy
6. Deploy via `git push` (Vercel auto-deploys from main branch)

### Vercel Cron Job

`vercel.json` schedules `/api/cleanup-guests` to run daily at **03:00 UTC**. The endpoint deletes all guest accounts (`isGuest: true`) older than 30 days. Requests must include `Authorization: Bearer {CRON_SECRET}`.

---

## Security Standards

### Mandatory rules for every new server action

1. Call `requireAuth()` (or `auth()`) at the top — `userId` comes only from the session, never from client input.
2. Every DB query that reads or writes user data includes `eq(table.userId, userId)`.
3. All inputs validated with Zod (`.parse()` or `.safeParse()`) before DB access.
4. Free-text and markdown fields must have `.max(100000)` in their Zod schema.

### Prohibited patterns

- `tls: { rejectUnauthorized: false }` in nodemailer — disables certificate verification.
- Accepting `userId` from request body, query params, or function arguments.
- Storing real-user credentials in `localStorage` or `sessionStorage`.
- Using `===` to compare secrets in API routes — use `crypto.timingSafeEqual()`.
- Using `rehype-raw` or `allowDangerousHtml` in react-markdown (XSS risk).

### Auth-specific requirements

- Passwords: bcrypt with `BCRYPT_ROUNDS = 12`
- Tokens: `crypto.randomBytes(32).toString('hex')`
- Token queries: must check `gt(expiresAt, new Date())` AND `isNull(usedAt)`
- Password reset: invalidate all existing unused tokens before issuing a new one; send confirmation email after reset completes

### Security headers

Applied to all routes via `next.config.ts` `headers()`: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, `X-XSS-Protection: 0`.

### Known deferred gaps (do not re-implement or re-flag)

| Gap                                           | Status                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------ |
| Rate limiting on auth endpoints               | Planned: `@upstash/ratelimit` + Upstash Redis before high-traffic launch |
| Email verification for new accounts           | Deferred to post-MVP                                                     |
| JWT session invalidation after password reset | Requires denylist — deferred                                             |
| Content Security Policy (CSP)                 | Requires tuning for KaTeX/Mermaid/Next.js nonces — deferred              |

### Security review

Run `/security-review` to audit current branch changes against this app's security model. The skill lives at `.claude/commands/security-review.md` and knows TortugaIQ's exact patterns.
