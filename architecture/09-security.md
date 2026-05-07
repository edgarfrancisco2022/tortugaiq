# 09 — Security

## Threat Model

TortugaIQ is a multi-tenant SaaS application. Each user's data is private. The relevant threat scenarios:

| Threat | Description |
|--------|-------------|
| **Horizontal privilege escalation** | User A reading or modifying User B's concepts |
| **Authentication bypass** | Accessing `/app/*` without a valid session |
| **Account takeover** | Guessing or stealing another user's password |
| **Injection attacks** | Injecting SQL or scripts via user-submitted content |
| **Session theft** | Stealing a user's session cookie |
| **Token replay** | Reusing a password reset link that has already been used |
| **Email enumeration** | Discovering which emails are registered |
| **Unauthorized cron execution** | Triggering the guest cleanup endpoint manually |

---

## Defense 1: Data Isolation (Most Critical)

Every database query in every Server Action filters by `userId`. This is not just an ownership check — it's the primary data filter.

```typescript
// CORRECT — userId is the WHERE clause itself
const concepts = await db.select()
  .from(concepts)
  .where(eq(concepts.userId, userId))

// WRONG — this would return all concepts, then check ownership
const concepts = await db.select().from(concepts)
const mine = concepts.filter(c => c.userId === userId)  // NEVER DO THIS
```

**Belt-and-suspenders design:** Even if the auth check somehow failed to throw, the query itself would return zero results for the wrong userId. The data cannot leak out.

This is enforced by convention in `src/actions/`. Every action starts with the same two lines:

```typescript
const session = await auth()
if (!session?.user?.id) throw new Error('Unauthorized')
const userId = session.user.id  // This value is trusted; it comes from the server JWT
```

**The userId must never come from the client.** The function parameters may include a concept ID or subject ID (to identify which record to operate on), but never a userId. The userId is always extracted from the server-side session.

---

## Defense 2: Next.js Middleware Authentication Gate

The middleware runs before any `/app/*` request reaches the application code:

```typescript
// src/middleware.ts
export default auth((req) => {
  const isLoggedIn = !!req.auth
  const isAppRoute = req.nextUrl.pathname.startsWith('/app')

  if (isAppRoute && !isLoggedIn) {
    return NextResponse.redirect(new URL('/sign-in', req.nextUrl.origin))
  }
  // ...
})
```

An unauthenticated request to any protected route is redirected before any Server Component or Server Action runs. This is a first line of defense — but not the only one, since Server Actions also check the session independently.

---

## Defense 3: SQL Injection Prevention

Drizzle ORM uses **parameterized queries** for all database operations. User input is never interpolated into SQL strings.

```typescript
// Drizzle generates parameterized SQL automatically:
db.select().from(concepts).where(eq(concepts.name, userInput))
// → SELECT * FROM concepts WHERE name = $1  with  [$1 = userInput]

// Direct SQL is also safe when using Drizzle's sql tag:
sql`GREATEST(0, ${concepts.reviewCount} - 1)`
// → GREATEST(0, review_count - $1)  with  [$1 = 1]
```

There is no string concatenation into SQL queries anywhere in this codebase. SQL injection is not possible through normal Drizzle usage.

---

## Defense 4: XSS Prevention

**React's JSX auto-escaping:** By default, any value rendered inside JSX is HTML-escaped:

```typescript
// Safe — React escapes the value
<p>{userInput}</p>
// If userInput = '<script>alert(1)</script>', renders as text, not HTML

// Dangerous — only used intentionally, never for user content
<div dangerouslySetInnerHTML={{ __html: userInput }} />
```

TortugaIQ never uses `dangerouslySetInnerHTML` for user content.

**Markdown rendering:** `react-markdown` does NOT use `dangerouslySetInnerHTML`. It parses the markdown into a React component tree, which is then rendered by React with normal escaping. Even if a user types `<script>` tags in their markdown notes, they are not executed.

**Mermaid diagrams:** The `MermaidDiagram` component renders diagrams via the Mermaid library. Mermaid sanitizes its output. Invalid or malicious chart syntax results in an error display, not script execution.

---

## Defense 5: CSRF Protection

Cross-Site Request Forgery (CSRF) attacks trick a user's browser into making authenticated requests to your server from a malicious third-party site.

Next.js Server Actions include **built-in CSRF protection**: they check the `Origin` header and only allow requests from the application's own origin. A malicious site at `evil.com` cannot trigger your Server Actions because Next.js will reject the `Origin: https://evil.com` header.

This works because Server Actions are called via `POST /_next/action` — not a publicly documented URL — and Next.js validates the origin before routing to the action function.

---

## Defense 6: bcrypt Password Hashing

Passwords are NEVER stored in plaintext. They are hashed using bcrypt before storage:

```typescript
const hash = await bcrypt.hash(password, 12)  // 12 = work factor
```

**Properties of bcrypt:**
- **One-way**: given the hash, the password cannot be recovered (no decryption)
- **Salted**: bcrypt automatically generates a random salt per hash, preventing rainbow table attacks (two identical passwords produce different hashes)
- **Slow by design**: 12 rounds takes ~40ms per hash on modern hardware. An attacker who steals the hash database must spend 40ms per guess — meaning brute-forcing a single 8-character password takes years

**Verification:**
```typescript
const valid = await bcrypt.compare(submittedPassword, storedHash)
// Returns true only if submittedPassword, when hashed with the stored salt, matches storedHash
```

---

## Defense 7: Password Reset Token Security

Password reset tokens are designed to be secure one-time-use credentials:

```typescript
// Generation
const token = crypto.randomBytes(32).toString('hex')  // 64 chars, 256 bits of entropy
```

**Security properties:**
- **256 bits of entropy**: There are 2^256 ≈ 10^77 possible tokens. Guessing one is computationally infeasible even with unlimited hardware
- **1-hour expiry**: Even if a token is intercepted, it's only useful for 1 hour after generation
- **Single use**: The `usedAt` column is set to `now()` on first use. Subsequent attempts with the same token fail the `usedAt IS NULL` check
- **No email enumeration**: `requestPasswordReset` always returns a success message, regardless of whether the email exists. An attacker cannot determine which emails are registered
- **Old tokens invalidated on new request**: Before inserting a new reset token, all existing unused tokens for the same user are marked `usedAt = now()`. A user cannot accumulate multiple valid reset windows simultaneously.
- **Confirmation email on reset**: After a successful password change, a notification email is sent to the user's address. If the reset was unauthorized, the user is immediately alerted.

---

## Defense 8: HttpOnly Cookie for JWT

The JWT session token is stored in an **HttpOnly cookie** set by Auth.js:

```
Set-Cookie: next-auth.session-token=...; HttpOnly; Secure; SameSite=Lax
```

- **HttpOnly**: JavaScript running in the browser cannot access this cookie. Even if an XSS attack were somehow successful, the session token cannot be stolen via `document.cookie`
- **Secure**: Only sent over HTTPS (Vercel enforces HTTPS in production)
- **SameSite=Lax**: Cookie is not sent in cross-site POST requests (additional CSRF mitigation)

---

## Defense 9: Cron Endpoint Authorization

The `/api/cleanup-guests` endpoint is public (no middleware protection), so it has its own auth:

```typescript
export async function POST(req: NextRequest) {
  const incoming = req.headers.get('x-cron-secret') ?? ''
  const expected = process.env.CRON_SECRET ?? ''
  const incomingBuf = Buffer.from(incoming)
  const expectedBuf = Buffer.from(expected)
  const valid =
    incomingBuf.length === expectedBuf.length &&
    expectedBuf.length > 0 &&
    crypto.timingSafeEqual(incomingBuf, expectedBuf)
  if (!valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // ... delete guests
}
```

Vercel Cron injects the `x-cron-secret` header automatically. The comparison uses `crypto.timingSafeEqual()` — a constant-time comparison that prevents timing side-channel attacks. A plain `===` string comparison could leak information about the shared prefix of the secret through millisecond-level response time differences.

---

## Defense 10: HTTP Security Headers

Standard security headers are applied to every HTTP response via `next.config.ts`:

```typescript
// next.config.ts
async headers() {
  return [
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        { key: 'X-XSS-Protection', value: '0' },
      ],
    },
  ]
},
```

| Header | Protection |
|--------|-----------|
| `X-Content-Type-Options: nosniff` | Prevents browsers from MIME-sniffing responses away from the declared content type |
| `X-Frame-Options: DENY` | Prevents the app from being embedded in an iframe — defeats clickjacking attacks |
| `Referrer-Policy: strict-origin-when-cross-origin` | Limits the `Referer` header to origin only on cross-origin requests, preventing URL leakage |
| `Permissions-Policy` | Explicitly disables browser APIs (camera, microphone, geolocation) that the app doesn't use |
| `X-XSS-Protection: 0` | Disables the legacy browser XSS filter — it caused more problems than it solved; CSP is the correct modern mitigation |

These headers apply to all routes — app pages, API routes, and static assets — because the `source: '/(.*)'` pattern matches everything. They're configured in `next.config.ts` rather than middleware so they apply globally without needing to be in the middleware matcher.

**Not yet implemented:** Content Security Policy (CSP). CSP requires careful tuning to allow KaTeX (math rendering), Mermaid (diagrams), and Next.js's own script injection. It is the most powerful XSS defense but is deferred until it can be properly tuned without breaking functionality.

---

## Defense 11: Environment Variable Isolation

Sensitive credentials are never committed to git or included in the client bundle:

| Variable | Secret? | Notes |
|----------|---------|-------|
| `DATABASE_URL` | Yes | Neon connection string with credentials |
| `AUTH_SECRET` | Yes | Used to sign/verify JWT cookies |
| `GOOGLE_CLIENT_SECRET` | Yes | OAuth credential |
| `RESEND_API_KEY` | Yes | Email service credential |
| `CRON_SECRET` | Yes | Cron endpoint auth |
| `AUTH_URL` | No | Public URL of the app |
| `GOOGLE_CLIENT_ID` | No | Public half of the OAuth credential |
| `RESEND_FROM_EMAIL` | No | Just an email address |

Next.js only includes environment variables in the client bundle if they are prefixed with `NEXT_PUBLIC_`. None of the sensitive variables use this prefix — they stay on the server.

---

## Known Security Gaps

These are intentionally accepted tradeoffs for v1:

**No rate limiting on sign-in attempts.** A determined attacker can try unlimited password guesses against the credentials endpoint. Mitigation in the meantime: bcrypt's 12 rounds make each guess expensive (~40ms), and short passwords are prevented by Zod's `min(8)` validation. Future mitigation: implement IP-based rate limiting or use Vercel's built-in DDoS protection.

**No account lockout.** Related to the above. A locked account would be a denial-of-service vector too, so the right solution is rate limiting + CAPTCHA rather than lockout.

**No email verification for credentials sign-up.** Users can sign up with someone else's email address. This is an accepted UX tradeoff (no friction for new users) that reduces to a support problem rather than a security problem — the real email owner can request a password reset.

**No audit log.** There is no record of who viewed or modified what, or when. For a personal knowledge app, this is an acceptable omission.

**Guest credentials in localStorage.** Guest email/password are stored in `localStorage` for return visits. localStorage is readable by any JavaScript on the domain — but because TortugaIQ has no third-party scripts or user-generated HTML execution, this is acceptable.

---

## Zod Validation as Defense-in-Depth

All Server Actions validate input with Zod before processing:

```typescript
// Even if the client sends malformed data, the server rejects it
const validated = conceptInputSchema.parse(input)
```

Zod validation happens AFTER the auth check (no point validating unauthorized requests) and BEFORE any database operation. This prevents:
- Saving empty concept names
- Saving invalid state/priority values
- Saving sessions with negative or unreasonably large minute values
- Bypassing field constraints via direct action calls

**Markdown field size limits:** `mvkNotes`, `markdownNotes`, and `referencesMarkdown` are validated with `.max(100000)` (100 KB). Without this limit, a client could POST multi-megabyte strings, causing database bloat and potential out-of-memory conditions when the content is later read and rendered. 100 KB is a generous upper bound for any realistic notes field.
