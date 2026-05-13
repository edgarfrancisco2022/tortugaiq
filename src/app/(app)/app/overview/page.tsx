'use client'

import Link from 'next/link'
import { useConcepts } from '@/hooks/useConcepts'
import { useStudySessions } from '@/hooks/useStudySessions'
import { useSubjects, useTopics, useSubtopics, useTags } from '@/hooks/useSubjects'

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatMinutes(total: number): string {
  if (!total) return '0m'
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function formatDate(date: Date | string | null | undefined): string | null {
  if (!date) return null
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Accent system ─────────────────────────────────────────────────────────────

type SectionAccent = 'blue' | 'emerald' | 'neutral'

// ── Shared components ─────────────────────────────────────────────────────────

function SectionTitle({ children, accent = 'neutral' }: { children: React.ReactNode; accent?: SectionAccent }) {
  const accentBar: Record<SectionAccent, string> = {
    blue: 'bg-blue-400',
    emerald: 'bg-emerald-400',
    neutral: 'bg-gray-300',
  }
  const labelColor: Record<SectionAccent, string> = {
    blue: 'text-blue-500',
    emerald: 'text-emerald-600',
    neutral: 'text-gray-400',
  }
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className={`w-0.5 h-4 rounded-full flex-shrink-0 ${accentBar[accent]}`} />
      <span className={`text-xs font-semibold uppercase tracking-wider flex-shrink-0 ${labelColor[accent]}`}>
        {children}
      </span>
      <div className="flex-1 border-t border-gray-100" />
    </div>
  )
}

function SummaryCard({ value, label, accent = 'neutral' }: { value: string | number; label: string; accent?: SectionAccent }) {
  const cardStyle: Record<SectionAccent, string> = {
    blue: 'bg-blue-50 border-blue-100',
    emerald: 'bg-emerald-50 border-emerald-100',
    neutral: 'bg-gray-50 border-gray-200',
  }
  const valueColor: Record<SectionAccent, string> = {
    blue: 'text-blue-700',
    emerald: 'text-emerald-700',
    neutral: 'text-gray-900',
  }
  return (
    <div className={`border rounded-xl px-4 py-3.5 ${cardStyle[accent]}`}>
      <div className={`text-2xl font-bold tabular-nums leading-tight ${valueColor[accent]}`}>{value}</div>
      <div className="text-xs text-gray-400 mt-1">{label}</div>
    </div>
  )
}

function BreakdownList({
  title,
  items,
  emptyText,
  dotColors,
}: {
  title: string
  items: { name: string; value: string | number }[]
  emptyText: string
  dotColors?: string[]
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{title}</div>
      {items.length === 0 ? (
        <p className="text-sm text-gray-400">{emptyText}</p>
      ) : (
        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={i} className="flex items-center justify-between gap-3 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                {dotColors?.[i] && (
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColors[i]}`} aria-hidden="true" />
                )}
                <span className="text-gray-700 min-w-0 break-words">{item.name}</span>
              </div>
              <span className="text-gray-400 flex-shrink-0 tabular-nums">{item.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── State dot colors ──────────────────────────────────────────────────────────

const STATE_DOT_COLORS: Record<string, string> = {
  NEW: 'bg-slate-400',
  LEARNING: 'bg-blue-400',
  REVIEWING: 'bg-amber-400',
  MEMORIZING: 'bg-teal-400',
  STORED: 'bg-emerald-500',
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OverviewPage() {
  const { data: concepts = [] } = useConcepts()
  const { data: studySessions = [] } = useStudySessions()
  const { data: subjects = [] } = useSubjects()
  const { data: topics = [] } = useTopics()
  const { data: subtopics = [] } = useSubtopics()
  const { data: tags = [] } = useTags()

  // ── Study ──────────────────────────────────────────────────────────────────
  const totalMinutes = studySessions.reduce((acc, s) => acc + (s.minutes || 0), 0)
  const totalSessions = studySessions.length
  const totalReviews = concepts.reduce((acc, c) => acc + (c.reviewCount || 0), 0)

  const minutesBySubject: Record<string, number> = {}
  const sessionsBySubjectMap: Record<string, number> = {}
  for (const s of studySessions) {
    const sid = s.subjectId || '__none__'
    minutesBySubject[sid] = (minutesBySubject[sid] || 0) + (s.minutes || 0)
    sessionsBySubjectMap[sid] = (sessionsBySubjectMap[sid] || 0) + 1
  }

  const reviewsBySubjectMap: Record<string, number> = {}
  for (const c of concepts) {
    if (c.subjectId) {
      reviewsBySubjectMap[c.subjectId] = (reviewsBySubjectMap[c.subjectId] || 0) + (c.reviewCount || 0)
    }
  }

  const subjectName = (sid: string) =>
    sid === '__none__' ? 'Unassigned' : (subjects.find((s) => s.id === sid)?.name || 'Unknown')

  const timeBySubject = Object.entries(minutesBySubject)
    .sort(([, a], [, b]) => b - a)
    .map(([sid, mins]) => ({ name: subjectName(sid), value: formatMinutes(mins) }))

  const sessionsBySubjectList = Object.entries(sessionsBySubjectMap)
    .sort(([, a], [, b]) => b - a)
    .map(([sid, count]) => ({ name: subjectName(sid), value: count }))

  const reviewsBySubjectList = Object.entries(reviewsBySubjectMap)
    .sort(([, a], [, b]) => b - a)
    .map(([sid, count]) => ({ name: subjects.find((s) => s.id === sid)?.name || 'Unknown', value: count }))

  const lastSession =
    studySessions.length > 0
      ? [...studySessions].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )[0]
      : null

  const lastSessionSubjectName = lastSession?.subjectId
    ? subjects.find((s) => s.id === lastSession.subjectId)?.name
    : null

  // ── Inventory ──────────────────────────────────────────────────────────────
  const conceptsBySubject = [...subjects]
    .sort((a, b) => {
      const ca = concepts.filter((c) => c.subjectId === a.id).length
      const cb = concepts.filter((c) => c.subjectId === b.id).length
      return cb - ca
    })
    .map((s) => ({
      name: s.name,
      value: concepts.filter((c) => c.subjectId === s.id).length,
    }))

  const recentConcepts = [...concepts]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10)

  const STATE_ORDER = ['NEW', 'LEARNING', 'REVIEWING', 'MEMORIZING', 'STORED'] as const
  const STATE_LABELS: Record<string, string> = {
    NEW: 'New',
    LEARNING: 'Learning',
    REVIEWING: 'Reviewing',
    MEMORIZING: 'Memorizing',
    STORED: 'Stored',
  }
  const conceptState = STATE_ORDER.map((state) => ({
    name: STATE_LABELS[state],
    value: concepts.filter((c) => (c.state || 'NEW') === state).length,
  }))

  // ── Catalog ────────────────────────────────────────────────────────────────
  const subjectList = [...subjects]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((s) => ({
      name: s.name,
      value: `${concepts.filter((c) => c.subjectId === s.id).length} concepts`,
    }))

  const topicList = [...topics]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((t) => ({
      name: t.name,
      value: `${concepts.filter((c) => c.topicId === t.id).length} concepts`,
    }))

  const subtopicList = [...subtopics]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((t) => ({
      name: t.name,
      value: `${concepts.filter((c) => c.subtopicId === t.id).length} concepts`,
    }))

  const tagList = [...tags]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((t) => ({
      name: t.name,
      value: `${concepts.filter((c) => c.tagIds.includes(t.id)).length} concepts`,
    }))

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-8 py-10">

      {/* Page header */}
      <div className="mb-10">
        <h1 className="text-2xl font-bold text-gray-900">Overview</h1>
        <p className="text-sm text-gray-400 mt-1">Study activity, knowledge inventory, and catalog structure.</p>
      </div>

      {/* ── Section 1: Study ─────────────────────────────────── */}
      <section className="mb-10">
        <SectionTitle accent="blue">Activity</SectionTitle>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          <SummaryCard accent="blue" value={formatMinutes(totalMinutes)} label="Total Study Time" />
          <SummaryCard accent="blue" value={totalSessions} label="Study Sessions" />
          <SummaryCard accent="blue" value={totalReviews} label="Total Reviews" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          <BreakdownList title="Study Time by Subject" items={timeBySubject} emptyText="No study data available" />
          <BreakdownList title="Sessions by Subject" items={sessionsBySubjectList} emptyText="No study data available" />
          <BreakdownList title="Reviews by Subject" items={reviewsBySubjectList} emptyText="No review data available" />
        </div>

        <div className="bg-white border border-gray-200 rounded-xl px-4 py-3.5">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Last Study Session</div>
          {lastSession ? (
            <p className="text-sm text-gray-700">
              {lastSessionSubjectName || 'Unassigned'}
              {' · '}
              {formatMinutes(lastSession.minutes)}
              {lastSession.createdAt && (
                <span className="text-gray-400"> · {formatDate(lastSession.createdAt)}</span>
              )}
            </p>
          ) : (
            <p className="text-sm text-gray-400">No study sessions yet</p>
          )}
        </div>
      </section>

      {/* ── Section 2: Inventory ──────────────────────────────── */}
      <section className="mb-10">
        <SectionTitle accent="emerald">Inventory</SectionTitle>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-3">
          <SummaryCard accent="emerald" value={concepts.length} label="Total Concepts" />
          <SummaryCard accent="emerald" value={subjects.length} label="Subjects" />
          <SummaryCard accent="emerald" value={topics.length} label="Topics" />
          <SummaryCard accent="emerald" value={subtopics.length} label="Subtopics" />
          <SummaryCard accent="emerald" value={tags.length} label="Tags" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <BreakdownList title="Concepts by Subject" items={conceptsBySubject} emptyText="No subjects yet" />
          <BreakdownList
            title="Concept State"
            items={conceptState}
            emptyText=""
            dotColors={STATE_ORDER.map((s) => STATE_DOT_COLORS[s])}
          />
        </div>

        <div className="bg-white border border-gray-200 rounded-xl px-4 py-3.5">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Recent Concepts</div>
          {recentConcepts.length === 0 ? (
            <p className="text-sm text-gray-400">No concepts added yet</p>
          ) : (
            <div className="space-y-0.5">
              {recentConcepts.map((c) => {
                const conceptSubject = subjects.find((s) => s.id === c.subjectId)
                return (
                  <Link
                    key={c.id}
                    href={`/app/concepts/${c.id}`}
                    className="group flex items-center gap-3 text-sm -mx-2 px-2 py-1.5 rounded-md hover:bg-gray-100 transition-colors duration-150 min-w-0"
                  >
                    {c.createdAt && (
                      <span className="text-gray-400 flex-shrink-0 text-xs tabular-nums">
                        {formatDate(c.createdAt)}
                      </span>
                    )}
                    <span className="text-gray-700 group-hover:text-gray-900 transition-colors min-w-0 break-words flex-1">
                      {c.name}
                    </span>
                    {conceptSubject && (
                      <div className="flex flex-wrap gap-1 flex-shrink-0">
                        <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full">
                          {conceptSubject.name}
                        </span>
                      </div>
                    )}
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </section>

      {/* ── Section 3: Catalog ───────────────────────────────── */}
      <section className="mb-10">
        <SectionTitle>Catalog</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <BreakdownList title="Subjects"  items={subjectList}  emptyText="No subjects yet" />
          <BreakdownList title="Topics"    items={topicList}    emptyText="No topics yet" />
          <BreakdownList title="Subtopics" items={subtopicList} emptyText="No subtopics yet" />
          <BreakdownList title="Tags"      items={tagList}      emptyText="No tags yet" />
        </div>
      </section>

    </div>
  )
}
