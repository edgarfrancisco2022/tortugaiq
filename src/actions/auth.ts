'use server'

import crypto from 'crypto'
import { and, eq, gt, isNull } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { Resend } from 'resend'
import { signIn } from '@/auth'
import { db } from '@/db'
import { passwordResetTokens, users } from '@/db/schema'
import {
  requestPasswordResetSchema,
  resetPasswordSchema,
  signUpSchema,
} from '@/lib/validations'

const BCRYPT_ROUNDS = 12

// ---------------------------------------------------------------------------
// Sign up with email + password
// ---------------------------------------------------------------------------

export async function signUpWithCredentials(input: {
  email: string
  name: string
  password: string
}): Promise<{ error?: string }> {
  const parsed = signUpSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const { email, name, password } = parsed.data

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .then((rows) => rows[0] ?? null)

  if (existing) {
    return { error: 'An account with this email already exists.' }
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)

  await db.insert(users).values({
    email: email.toLowerCase(),
    name,
    passwordHash,
  })

  return {}
}

// ---------------------------------------------------------------------------
// Request password reset — generates token and sends email
// ---------------------------------------------------------------------------

export async function requestPasswordReset(input: {
  email: string
}): Promise<{ error?: string }> {
  const parsed = requestPasswordResetSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const { email } = parsed.data

  // Always return success to avoid leaking which emails are registered
  const user = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .then((rows) => rows[0] ?? null)

  if (!user) return {}

  // Invalidate any existing unused tokens for this user before issuing a new one
  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.usedAt)))

  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

  await db.insert(passwordResetTokens).values({
    userId: user.id,
    token,
    expiresAt,
  })

  const resetUrl = `${process.env.AUTH_URL}/forgot-password/reset?token=${token}`

  if (process.env.NODE_ENV === 'development') {
    console.log(`[DEV] Password reset URL: ${resetUrl}`)
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from: `TortugaIQ <${process.env.RESEND_FROM_EMAIL}>`,
      to: user.email,
      subject: 'Reset your TortugaIQ password',
      html: `
        <p>You requested a password reset for your TortugaIQ account.</p>
        <p><a href="${resetUrl}">Click here to reset your password</a></p>
        <p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
      `,
    })
  } catch (err) {
    console.error('[requestPasswordReset] Email send failed:', err)
  }

  return {}
}

// ---------------------------------------------------------------------------
// Reset password — validates token and sets new password
// ---------------------------------------------------------------------------

export async function resetPassword(input: {
  token: string
  newPassword: string
}): Promise<{ error?: string }> {
  const parsed = resetPasswordSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const { token, newPassword } = parsed.data

  const resetToken = await db
    .select()
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.token, token),
        gt(passwordResetTokens.expiresAt, new Date())
      )
    )
    .then((rows) => rows[0] ?? null)

  if (!resetToken || resetToken.usedAt !== null) {
    return { error: 'This reset link is invalid or has already been used.' }
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)

  const [user] = await Promise.all([
    db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, resetToken.userId))
      .then((rows) => rows[0] ?? null),
    db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, resetToken.userId)),
    db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.id, resetToken.id)),
  ])

  if (user) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: `TortugaIQ <${process.env.RESEND_FROM_EMAIL}>`,
        to: user.email,
        subject: 'Your TortugaIQ password was changed',
        html: `
          <p>Your TortugaIQ password was successfully changed.</p>
          <p>If you didn't make this change, please contact us immediately by replying to this email.</p>
        `,
      })
    } catch (err) {
      console.error('[resetPassword] Confirmation email send failed:', err)
    }
  }

  return {}
}

// ---------------------------------------------------------------------------
// Create a guest (demo) user with a clean empty account
// ---------------------------------------------------------------------------

export async function createGuestUser(): Promise<
  { error: string } | { email: string; password: string }
> {
  const uuid = crypto.randomUUID()
  const email = `guest-${uuid}@demo.tortugaiq.com`
  const password = crypto.randomUUID()
  const passwordHash = await bcrypt.hash(password, 10)

  await db
    .insert(users)
    .values({ email, name: 'Demo Guest', passwordHash, isGuest: true })

  return { email, password }
}
