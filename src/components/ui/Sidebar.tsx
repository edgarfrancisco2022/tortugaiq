'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { useSubjects } from '@/hooks/useSubjects'
import { useDirtyState } from '@/components/providers/DirtyStateProvider'
import Logo from '@/components/ui/Logo'

// ── Icons ──────────────────────────────────────────────────────────────────

const LibraryIcon = () => (
  <svg viewBox="0 0 18 18" fill="none" className="w-4 h-4 flex-shrink-0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="3" width="3" height="12" rx="0.5" />
    <rect x="6" y="5" width="3" height="10" rx="0.5" />
    <path d="M11 14.5l2.5-9.5 3 .8-2.5 9.5-3-.8z" />
  </svg>
)

const FocusIcon = () => (
  <svg viewBox="0 0 18 18" fill="none" className="w-4 h-4 flex-shrink-0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="9" r="7" />
    <circle cx="9" cy="9" r="3" />
  </svg>
)

const IndexIcon = () => (
  <svg viewBox="0 0 18 18" fill="none" className="w-4 h-4 flex-shrink-0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="14" height="14" rx="1.5" />
    <line x1="6" y1="6" x2="12" y2="6" />
    <line x1="6" y1="9" x2="12" y2="9" />
    <line x1="6" y1="12" x2="10" y2="12" />
  </svg>
)

const PlusIcon = () => (
  <svg viewBox="0 0 18 18" fill="none" className="w-4 h-4 flex-shrink-0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <line x1="9" y1="2" x2="9" y2="16" />
    <line x1="2" y1="9" x2="16" y2="9" />
  </svg>
)

const ChevronLeftIcon = () => (
  <svg viewBox="0 0 18 18" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="11 4 6 9 11 14" />
  </svg>
)

const HamburgerIcon = () => (
  <svg viewBox="0 0 18 18" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <line x1="2" y1="4.5" x2="16" y2="4.5" />
    <line x1="2" y1="9" x2="16" y2="9" />
    <line x1="2" y1="13.5" x2="16" y2="13.5" />
  </svg>
)

const OverviewIcon = () => (
  <svg viewBox="0 0 18 18" fill="none" className="w-4 h-4 flex-shrink-0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="6" height="6" rx="1" />
    <rect x="10" y="2" width="6" height="6" rx="1" />
    <rect x="2" y="10" width="6" height="6" rx="1" />
    <rect x="10" y="10" width="6" height="6" rx="1" />
  </svg>
)

const HomeIcon = () => (
  <svg viewBox="0 0 18 18" fill="none" className="w-4 h-4 flex-shrink-0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 8l7-6 7 6" />
    <path d="M4 7v8h4v-4h2v4h4V7" />
  </svg>
)

const ClockIcon = () => (
  <svg viewBox="0 0 18 18" fill="none" className="w-4 h-4 flex-shrink-0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="9" r="7" />
    <polyline points="9 5 9 9 12 11" />
  </svg>
)

// ── Helpers ─────────────────────────────────────────────────────────────────

function getInitials(name = '', email = '') {
  const src = name || email
  return (
    src
      .split(' ')
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || '?'
  )
}

// ── NavItem helper (uses pathname to detect active) ──────────────────────────

function NavItem({
  href,
  exact = false,
  collapsed,
  title,
  onClick,
  children,
}: {
  href: string
  exact?: boolean
  collapsed: boolean
  title?: string
  onClick?: () => void
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { isDirty, requestNavigation } = useDirtyState()
  const isActive = exact ? pathname === href : pathname.startsWith(href)
  const base = isActive
    ? 'bg-gray-700 text-white font-medium'
    : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100'

  return (
    <Link
      href={href}
      title={title}
      onClick={(e) => {
        // Clear any stale back-navigation state so the destination view always
        // starts fresh (scroll at top, first concept active) on sidebar nav.
        sessionStorage.removeItem('cv-back')
        ;(window as any).__cvBackPending = false
        if (isDirty) {
          e.preventDefault()
          requestNavigation(() => {
            onClick?.()
            router.push(href)
          })
        } else {
          onClick?.()
        }
      }}
      className={
        collapsed
          ? `flex items-center justify-center p-2 rounded-lg transition-colors focus:outline-none ${base}`
          : `flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors focus:outline-none ${base}`
      }
    >
      {children}
    </Link>
  )
}

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  onNewConcept: () => void
  collapsed: boolean
  onToggle: () => void
  mobileOpen: boolean
  onMobileClose: () => void
}

export default function Sidebar({
  onNewConcept,
  collapsed,
  onToggle,
  mobileOpen,
  onMobileClose,
}: Props) {
  const { data: subjects = [] } = useSubjects()
  const { data: session } = useSession()
  const router = useRouter()
  const { isDirty, requestNavigation } = useDirtyState()
  const user = session?.user

  const sorted = [...subjects].sort((a, b) => a.name.localeCompare(b.name))

  async function handleSignOut() {
    await signOut({ callbackUrl: '/' })
  }

  const navItem = (isActive: boolean) => {
    const base = isActive
      ? 'bg-gray-700 text-white font-medium'
      : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100'
    return collapsed
      ? `flex items-center justify-center p-2 rounded-lg transition-colors ${base}`
      : `flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${base}`
  }

  const asideClass = [
    'bg-gray-900 text-gray-300 flex flex-col h-dvh fixed left-0 top-0 select-none z-40 transition-all duration-200',
    collapsed ? 'md:w-16' : 'md:w-60',
    mobileOpen ? 'w-72 translate-x-0 shadow-2xl' : 'w-72 -translate-x-full md:translate-x-0',
  ].join(' ')

  return (
    <aside className={asideClass} aria-label="Application sidebar">
      {/* Brand / Toggle */}
      <div
        className={`border-b border-gray-700/60 flex items-center ${collapsed ? 'px-0 py-4 justify-center' : 'px-5 py-4 justify-between'}`}
      >
        {collapsed ? (
          <button
            onClick={onToggle}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Expand sidebar"
            title="Expand sidebar"
          >
            <HamburgerIcon />
          </button>
        ) : (
          <>
            <Link
              href="/app"
              className="hover:opacity-80 transition-opacity focus:outline-none"
              aria-label="TortugaIQ home"
              onClick={(e) => {
                sessionStorage.removeItem('cv-back')
                ;(window as any).__cvBackPending = false
                if (isDirty) {
                  e.preventDefault()
                  requestNavigation(() => router.push('/app'))
                }
              }}
            >
              <Logo variant="sidebar" />
              {subjects.length > 0 && (
                <div className="text-gray-400 text-xs mt-0.5 pl-7">
                  {subjects.reduce((n, s) => n + (s.conceptCount ?? 0), 0)} concept
                  {subjects.reduce((n, s) => n + (s.conceptCount ?? 0), 0) !== 1 ? 's' : ''}
                </div>
              )}
            </Link>
            <button
              onClick={() => {
                onToggle()
                onMobileClose()
              }}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
            >
              <ChevronLeftIcon />
            </button>
          </>
        )}
      </div>

      <nav aria-label="Main navigation" className="flex flex-col flex-1 overflow-hidden">
        {/* New Concept + Home */}
        <div className={`pt-3 space-y-0.5 ${collapsed ? 'px-2' : 'px-3'}`}>
          {collapsed ? (
            <>
              <NavItem href="/app" exact collapsed={collapsed} title="Home" onClick={onMobileClose}>
                <HomeIcon />
              </NavItem>
              <button
                onClick={onNewConcept}
                className="w-full flex items-center justify-center p-2 rounded-lg text-gray-300 hover:bg-gray-700 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset"
                aria-label="Create new concept"
                title="New Concept"
              >
                <PlusIcon />
              </button>
            </>
          ) : (
            <button
              onClick={onNewConcept}
              className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-300 hover:bg-gray-700 hover:text-white transition-colors text-left focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset"
              aria-label="Create new concept"
            >
              <span className="text-base font-light" aria-hidden="true">
                +
              </span>{' '}
              New Concept
            </button>
          )}
        </div>

        {/* Track section */}
        <div className={`pt-3 space-y-0.5 ${collapsed ? 'px-2' : 'px-3'}`}>
          {!collapsed && (
            <p
              className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 mb-1"
              aria-hidden="true"
            >
              Track
            </p>
          )}
          <NavItem href="/app/overview" collapsed={collapsed} title="Overview" onClick={onMobileClose}>
            <OverviewIcon />
            {!collapsed && ' Overview'}
          </NavItem>
          <NavItem href="/app/sessions" collapsed={collapsed} title="Sessions" onClick={onMobileClose}>
            <ClockIcon />
            {!collapsed && ' Sessions'}
          </NavItem>
        </div>

        {/* Review section */}
        <div className={`pt-3 space-y-0.5 ${collapsed ? 'px-2' : 'px-3'}`}>
          {!collapsed && (
            <p
              className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 mb-1"
              aria-hidden="true"
            >
              Review
            </p>
          )}
          <NavItem href="/app/library" collapsed={collapsed} title="Library" onClick={onMobileClose}>
            <LibraryIcon />
            {!collapsed && ' Library'}
          </NavItem>
          <NavItem href="/app/focus" collapsed={collapsed} title="Focus" onClick={onMobileClose}>
            <FocusIcon />
            {!collapsed && ' Focus'}
          </NavItem>
          <NavItem href="/app/index" collapsed={collapsed} title="Index" onClick={onMobileClose}>
            <IndexIcon />
            {!collapsed && ' Index'}
          </NavItem>
        </div>

        {/* Subjects — hidden when collapsed */}
        {!collapsed && (
          <div className="flex-1 overflow-y-auto overscroll-none px-3 pt-3">
            {sorted.length > 0 && (
              <>
                <p
                  className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 mb-1"
                  aria-hidden="true"
                >
                  Subjects
                </p>
                {sorted.map((subject) => (
                  <SubjectLink
                    key={subject.id}
                    subject={subject}
                    onMobileClose={onMobileClose}
                  />
                ))}
              </>
            )}
          </div>
        )}

        {collapsed && <div className="flex-1" />}
      </nav>

      {/* User footer */}
      {user && (
        <div
          className={`border-t border-gray-700/60 ${collapsed ? 'px-2 py-3 flex justify-center' : 'px-3 py-3'}`}
        >
          {collapsed ? (
            <button
              onClick={handleSignOut}
              className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold hover:bg-blue-500 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400"
              aria-label={`Sign out (signed in as ${user.name || user.email})`}
              title={`${user.name || user.email} — Sign out`}
            >
              {getInitials(user.name ?? '', user.email ?? '')}
            </button>
          ) : (
            <>
              <div
                className="flex items-center gap-2 px-2 py-1.5"
                aria-label={`Signed in as ${user.name || user.email}`}
              >
                <div
                  className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                  aria-hidden="true"
                >
                  {getInitials(user.name ?? '', user.email ?? '')}
                </div>
                <div className="flex-1 min-w-0">
                  {user.name && (
                    <div className="text-xs font-medium text-gray-300 truncate">{user.name}</div>
                  )}
                  <div className="text-xs text-gray-400 truncate">{user.email}</div>
                </div>
              </div>
              <button
                onClick={handleSignOut}
                className="w-full mt-1 text-xs text-gray-400 hover:text-gray-200 px-2 py-1 text-left transition-colors rounded-md hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset"
              >
                Sign out
              </button>
            </>
          )}
        </div>
      )}
    </aside>
  )
}

// ── SubjectLink (needs pathname) ─────────────────────────────────────────────

function SubjectLink({
  subject,
  onMobileClose,
}: {
  subject: { id: string; name: string; conceptCount: number }
  onMobileClose: () => void
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { isDirty, requestNavigation } = useDirtyState()
  const isActive = pathname === `/app/subjects/${subject.id}`
  const href = `/app/subjects/${subject.id}`

  return (
    <Link
      href={href}
      prefetch={true}
      onClick={(e) => {
        sessionStorage.removeItem('cv-back')
        ;(window as any).__cvBackPending = false
        if (isDirty) {
          e.preventDefault()
          requestNavigation(() => {
            onMobileClose()
            router.push(href)
          })
        } else {
          onMobileClose()
        }
      }}
      className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-sm transition-colors focus:outline-none ${
        isActive
          ? 'bg-gray-700 text-white font-medium'
          : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100'
      }`}
    >
      <span className="truncate">{subject.name}</span>
      <span
        className="text-xs text-gray-400 ml-1"
        aria-label={`${subject.conceptCount} concepts`}
      >
        {subject.conceptCount}
      </span>
    </Link>
  )
}
