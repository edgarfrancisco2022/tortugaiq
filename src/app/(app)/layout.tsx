'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useQueryClient } from '@tanstack/react-query'
import Sidebar from '@/components/ui/Sidebar'
import StudySessionBar from '@/components/ui/StudySessionBar'
import { ConceptFormProvider, useConceptForm } from '@/components/providers/ConceptFormProvider'
import { DirtyStateProvider, useDirtyState } from '@/components/providers/DirtyStateProvider'
import { SidebarStateContext } from '@/components/providers/SidebarStateProvider'
import { ViewStateRegistryProvider } from '@/components/providers/ViewStateRegistryProvider'
import { useConcepts } from '@/hooks/useConcepts'
import { useSubjects, useTopics, useSubtopics, useTags } from '@/hooks/useSubjects'

const GUEST_TTL_DAYS = 30

function GuestBanner() {
  const [dismissed, setDismissed] = useState(false)
  const { data: session } = useSession()

  if (dismissed || !session?.user?.isGuest) return null

  const daysRemaining = session.user.guestCreatedAt
    ? Math.max(0, Math.ceil(
        (session.user.guestCreatedAt + GUEST_TTL_DAYS * 24 * 60 * 60 * 1000 - Date.now())
        / (24 * 60 * 60 * 1000)
      ))
    : GUEST_TTL_DAYS

  return (
    <div className="flex items-center gap-3 bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-800">
      <span>
        You&apos;re in <strong>demo mode</strong>. This account and all its data will be deleted in{' '}
        <strong>{daysRemaining} {daysRemaining === 1 ? 'day' : 'days'}</strong>.
      </span>
      <Link
        href="/sign-up"
        className="font-medium underline underline-offset-2 hover:text-amber-900 whitespace-nowrap transition-colors"
      >
        Create a free account
      </Link>
      <button
        onClick={() => setDismissed(true)}
        className="ml-auto text-amber-600 hover:text-amber-900 transition-colors flex-shrink-0"
        aria-label="Dismiss banner"
      >
        ✕
      </button>
    </div>
  )
}

function AppShellInner({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()
  const { openConceptForm } = useConceptForm()
  const qc = useQueryClient()
  const { data: session } = useSession()

  // Prefetch shared data as soon as the app shell mounts so navigating to
  // Library, Focus, Index, or any subject view hits the cache instead of
  // waiting for a cold fetch.
  useConcepts()
  useSubjects()
  useTopics()
  useSubtopics()
  useTags()

  useEffect(() => {
    if (session?.user && !session.user.isGuest) {
      localStorage.removeItem('tiq-guest-credentials')
    }
  }, [session])

  // [DEBUG] Log all TQ cache events to trace race with router.push
  useEffect(() => {
    const unsub = qc.getQueryCache().subscribe((event) => {
      const type = event.type
      if (['invalidated', 'updated', 'added', 'removed', 'observerAdded', 'observerRemoved'].includes(type)) {
        console.log('[TQ cache]', type, (event as any).query?.queryKey, performance.now())
      }
    })
    return unsub
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // [DEBUG] Log pathname changes to detect whether navigation commits
  useEffect(() => {
    console.log('[redirect] pathname changed to', pathname, performance.now())
  }, [pathname])

  // Auto-close mobile drawer on any route change
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])
  const { requestNavigation } = useDirtyState()

  const mainLeft = `${collapsed ? 'md:pl-16' : 'md:pl-60'}`

  return (
    <SidebarStateContext.Provider value={{ collapsed }}>
      <Sidebar
        onNewConcept={() => requestNavigation(() => openConceptForm())}
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <StudySessionBar
        collapsed={collapsed}
        onMobileOpen={() => { setMobileOpen(true); setCollapsed(false) }}
      />

      {/* Mobile overlay backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-30 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <main
        id="main-content"
        className={`${mainLeft} pt-11 h-screen transition-all duration-200 overflow-y-auto overflow-x-hidden scroll-pt-11 scroll-pb-12`}
      >
        <GuestBanner />
        {children}
      </main>
    </SidebarStateContext.Provider>
  )
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <DirtyStateProvider>
      <ViewStateRegistryProvider>
        <ConceptFormProvider>
          <AppShellInner>{children}</AppShellInner>
        </ConceptFormProvider>
      </ViewStateRegistryProvider>
    </DirtyStateProvider>
  )
}
