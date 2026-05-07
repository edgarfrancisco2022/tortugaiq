'use server'

import { signIn } from '@/auth'
import { signUpWithCredentials } from '@/actions/auth'

export async function signUpWithGoogle() {
  await signIn('google', { redirectTo: '/app' })
}

export async function signUpAction(
  _prevState: { error: string; success?: boolean },
  formData: FormData
): Promise<{ error: string; success?: boolean; email?: string; password?: string }> {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const result = await signUpWithCredentials({
    email,
    name: formData.get('name') as string,
    password,
  })

  if (result.error) {
    return { error: result.error }
  }

  // Return credentials so the client can sign in — server-side signIn() inside
  // a Server Action fails to set cookies reliably in production (the Set-Cookie
  // header gets lost in the redirect chain). Client-side signIn() from
  // next-auth/react is the reliable path.
  return { error: '', success: true, email, password }
}
