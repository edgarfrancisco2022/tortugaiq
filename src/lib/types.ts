export type ConceptState = 'NEW' | 'LEARNING' | 'REVIEWING' | 'MEMORIZING' | 'STORED'
export type ConceptPriority = 'LOW' | 'MEDIUM' | 'HIGH'
export type SubjectSortMode = 'alpha' | 'alpha_desc' | 'date_new' | 'date_old' | 'reviews_high' | 'reviews_low' | 'custom'

export interface Subject {
  id: string
  userId: string
  name: string
  createdAt: Date
  updatedAt: Date
}

export interface Topic {
  id: string
  userId: string
  name: string
  createdAt: Date
  updatedAt: Date
}

export interface Subtopic {
  id: string
  userId: string
  name: string
  createdAt: Date
  updatedAt: Date
}

export interface Tag {
  id: string
  userId: string
  name: string
  createdAt: Date
  updatedAt: Date
}

export interface Concept {
  id: string
  userId: string
  name: string
  mvkNotes: string
  markdownNotes: string
  referencesMarkdown: string
  state: ConceptState
  priority: ConceptPriority
  reviewCount: number
  pinned: boolean
  createdAt: Date
  updatedAt: Date
  // Direct FK fields (stored on concepts table)
  subjectId: string | null
  topicId: string | null
  subtopicId: string | null
  // Joined fields (populated by query, not stored in concepts table)
  tagIds: string[]
  // Name fields (populated by getConcept single-concept query)
  subjectName?: string | null
  tagNames?: string[]
  topicName?: string | null
  subtopicName?: string | null
}

export interface StudySession {
  id: string
  userId: string
  minutes: number
  subjectId: string | null
  createdAt: Date
}

// Input types for mutations (names not IDs — server resolves/creates)
export interface ConceptInput {
  name: string
  subjectName: string | null
  topicName: string | null
  subtopicName: string | null
  tagNames: string[]
  mvkNotes?: string
  markdownNotes?: string
  referencesMarkdown?: string
  state?: ConceptState
  priority?: ConceptPriority
  pinned?: boolean
}

export interface StudySessionInput {
  minutes: number
  subjectId?: string | null
}
