import { z } from 'zod'

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const signUpSchema = z.object({
  email: z.string().email('Invalid email address'),
  name: z.string().min(1, 'Name is required').max(100),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128),
})

export type SignUpInput = z.infer<typeof signUpSchema>

export const requestPasswordResetSchema = z.object({
  email: z.string().email('Invalid email address'),
})

export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128),
})

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>

// ---------------------------------------------------------------------------
// Concepts
// ---------------------------------------------------------------------------

const nameList = z
  .array(z.string().trim().min(1).max(200))
  .default([])

const singleName = z.string().trim().min(1).max(200).nullable().default(null)

export const conceptInputSchema = z.object({
  name: z.string().trim().min(1, 'Concept name is required').max(200),
  subjectName: singleName,
  topicName: singleName,
  subtopicName: singleName,
  tagNames: nameList,
  mvkNotes: z.string().max(100000).default(''),
  markdownNotes: z.string().max(100000).default(''),
  referencesMarkdown: z.string().max(100000).default(''),
  state: z
    .enum(['NEW', 'LEARNING', 'REVIEWING', 'MEMORIZING', 'STORED'])
    .default('NEW'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
  pinned: z.boolean().default(false),
}).refine(
  (data) => data.subtopicName === null || data.topicName !== null,
  { message: 'A topic is required when a subtopic is selected', path: ['subtopicName'] }
)

export type ConceptInputValidated = z.infer<typeof conceptInputSchema>

export const updateConceptFieldSchema = z.object({
  id: z.string().min(1),
  field: z.enum(['state', 'priority', 'pinned']),
  value: z.union([
    z.enum(['NEW', 'LEARNING', 'REVIEWING', 'MEMORIZING', 'STORED']),
    z.enum(['LOW', 'MEDIUM', 'HIGH']),
    z.boolean(),
  ]),
})

export const updateConceptContentSchema = z.object({
  id: z.string().min(1),
  field: z.enum(['mvkNotes', 'markdownNotes', 'referencesMarkdown']),
  value: z.string().max(100000),
})

// ---------------------------------------------------------------------------
// Study sessions
// ---------------------------------------------------------------------------

export const addStudySessionSchema = z.object({
  minutes: z.number().int().positive().max(1440),
  subjectId: z.string().nullable().optional(),
})

export type AddStudySessionInput = z.infer<typeof addStudySessionSchema>

export const updateStudySessionSchema = z.object({
  minutes: z.number().int().positive().max(1440),
  subjectId: z.string().nullable().optional(),
})

export type UpdateStudySessionInput = z.infer<typeof updateStudySessionSchema>

// ---------------------------------------------------------------------------
// Subjects
// ---------------------------------------------------------------------------

export const sortModeSchema = z.enum(['alpha', 'alpha_desc', 'date_new', 'date_old', 'reviews_high', 'reviews_low', 'custom'])
