import Link from 'next/link'
import Logo from '@/components/ui/Logo'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy — TortugaIQ',
  description: 'Privacy policy for TortugaIQ.',
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* Top nav */}
      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Logo />
          </Link>
          <div className="flex items-center gap-5">
            <Link href="/notes" className="text-sm text-gray-500 hover:text-gray-800 transition-colors">Notes</Link>
            <Link href="/sign-in" className="text-sm text-gray-500 hover:text-gray-800 transition-colors">Sign in</Link>
            <Link
              href="/sign-up"
              className="text-sm bg-gray-900 text-white px-4 py-1.5 rounded-lg hover:bg-gray-700 transition-colors font-medium"
            >
              Sign up
            </Link>
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-2xl mx-auto px-6 py-16">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-400 mb-10">Last updated: April 19, 2026</p>

        <div className="space-y-8 text-sm text-gray-600 leading-relaxed">

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">What we collect</h2>
            <p>
              When you create an account or sign in with Google, we receive your name and
              email address from that provider. If you register with email and password, we store your
              name, email, and a hashed version of your password. We never store your password in plain text.
            </p>
            <p className="mt-2">
              We also store the content you create inside the app — concepts, notes, subjects, topics,
              tags, and study session records — in order to provide the service.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">How we use it</h2>
            <p>
              Your data is used solely to operate TortugaIQ. We do not sell your data, share it with
              advertisers, or use it for any purpose beyond running the service.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">Third-party services</h2>
            <p>We use the following third-party services to operate the app:</p>
            <ul className="mt-2 space-y-1 list-disc list-inside text-gray-500">
              <li>Google OAuth — for sign-in</li>
              <li>Neon — PostgreSQL database hosting</li>
              <li>Vercel — application hosting</li>
            </ul>
            <p className="mt-2">
              Each of these services operates under their own privacy policies.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">Data retention</h2>
            <p>
              Your data is retained for as long as your account is active. You may request deletion
              at any time.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">Deleting your data</h2>
            <p>
              To delete your account and all associated data, send an email to{' '}
              <a
                href="mailto:edgarfrancisco2022@gmail.com"
                className="text-teal-700 hover:underline"
              >
                edgarfrancisco2022@gmail.com
              </a>{' '}
              with the subject line <span className="font-medium text-gray-700">"Delete my account"</span>.
              We will permanently delete your data within 30 days.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">Contact</h2>
            <p>
              Questions about this policy can be sent to{' '}
              <a
                href="mailto:edgarfrancisco2022@gmail.com"
                className="text-teal-700 hover:underline"
              >
                edgarfrancisco2022@gmail.com
              </a>.
            </p>
          </section>

        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-8 mt-16">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between text-xs text-gray-400">
          <Logo variant="footer" />
          <div className="flex items-center gap-4">
            <Link href="/notes" className="hover:text-gray-600 transition-colors">Notes</Link>
            <Link href="/privacy" className="hover:text-gray-600 transition-colors">Privacy</Link>
            <Link href="/sign-in" className="hover:text-gray-600 transition-colors">Sign in</Link>
            <Link href="/sign-up" className="hover:text-gray-600 transition-colors">Sign up</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
