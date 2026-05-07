import NextAuth, { type DefaultSession } from 'next-auth'
import Google from 'next-auth/providers/google'
import Credentials from 'next-auth/providers/credentials'
import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { db } from '@/db'
import { users, accounts, sessions, verificationTokens } from '@/db/schema'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      isGuest: boolean
      guestCreatedAt?: number
    } & DefaultSession['user']
  }
  interface User {
    isGuest?: boolean
    createdAt?: Date
  }
}


export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: 'jwt' },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const user = await db.query.users.findFirst({
          where: eq(users.email, (credentials.email as string).toLowerCase()),
        })

        if (!user?.passwordHash) return null

        const valid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        )

        if (!valid) return null

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          isGuest: user.isGuest,
          createdAt: user.createdAt,
        }
      },
    }),
  ],
  pages: {
    signIn: '/sign-in',
    error: '/sign-in',
  },
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id
      }
      if (user !== undefined) {
        ;(token as any).isGuest = (user as any).isGuest ?? false
        if ((user as any).isGuest) {
          ;(token as any).guestCreatedAt = (user as any).createdAt?.getTime()
        }
      }
      return token
    },
    session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub
      }
      session.user.isGuest = (token as any).isGuest ?? false
      if ((token as any).guestCreatedAt) {
        session.user.guestCreatedAt = (token as any).guestCreatedAt as number
      }
      return session
    },
  },
})
