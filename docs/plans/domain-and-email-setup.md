# Plan: Custom Domain + Resend Email Integration

## Why This Is Needed

TortugaIQ is currently deployed at `tortugaiq.vercel.app`. The password reset email
feature requires sending transactional email to any user's email address. Resend (the
email provider already integrated) requires a **verified sender domain** to send to
arbitrary recipients — without one, it can only send to the Resend account owner's email.

Acquiring a custom domain solves both:
1. Professional app URL (e.g. `tortugaiq.com` instead of `tortugaiq.vercel.app`)
2. Verified sender domain for Resend → password reset and confirmation emails work for all users

---

## Phase 1 — Buy the Domain

**Recommended registrar: Cloudflare Registrar** (registrar.cloudflare.com)

- Sells domains at wholesale cost (no markup like GoDaddy/Namecheap)
- DNS management is fast and excellent for adding Vercel + Resend records
- `.com` ≈ $10–11/year, `.dev` ≈ $12/year, `.app` ≈ $14/year

**Steps:**
1. Go to `registrar.cloudflare.com` → search for your desired domain
2. Purchase and confirm registration
3. Cloudflare automatically becomes your DNS provider (no extra setup)

---

## Phase 2 — Connect Domain to Vercel

1. In Vercel: **Project Settings → Domains → Add Domain**
2. Enter your domain (e.g. `tortugaiq.com`) and confirm
3. Vercel will show you DNS records to add — typically:
   - `A` record: `@` → Vercel's IP (for apex domain)
   - `CNAME` record: `www` → `cname.vercel-dns.com`
4. Add these records in Cloudflare DNS dashboard
5. Vercel will auto-detect propagation and mark the domain as active (usually < 5 minutes on Cloudflare)

**After domain is active:**

Update `AUTH_URL` in Vercel environment variables:
```
AUTH_URL=https://yourdomain.com
```

---

## Phase 3 — Update OAuth Callback URLs

Both Google and Facebook OAuth apps are configured with the old Vercel URL. They must be updated before OAuth sign-in will work on the new domain.

### Google Cloud Console
1. Go to [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials
2. Open the OAuth 2.0 Client ID for TortugaIQ
3. Under **Authorized redirect URIs**, add:
   - `https://yourdomain.com/api/auth/callback/google`
   - (Keep the `localhost:3000` URI for local dev)
4. Save

---

## Phase 4 — Verify Domain in Resend

1. Go to Resend dashboard → **Domains → Add Domain**
2. Enter your domain (e.g. `tortugaiq.com`)
3. Resend will provide DNS records to add — typically:
   - `TXT` record for SPF (sender verification)
   - `CNAME` records for DKIM (email signing)
   - Optionally a `MX` record for bounce handling
4. Add all records in Cloudflare DNS dashboard
5. Back in Resend, click **Verify** — should pass within minutes on Cloudflare

---

## Phase 5 — Code Changes

### `src/actions/auth.ts`

Replace the hardcoded `onboarding@resend.dev` sender with `RESEND_FROM_EMAIL`:

```typescript
// requestPasswordReset — line ~101
from: `TortugaIQ <${process.env.RESEND_FROM_EMAIL}>`,

// resetPassword — line ~170
from: `TortugaIQ <${process.env.RESEND_FROM_EMAIL}>`,
```

### Environment Variables

**Vercel** (Production env vars):
```
RESEND_FROM_EMAIL=noreply@yourdomain.com   # or hello@, support@, etc.
AUTH_URL=https://yourdomain.com
```

**`.env.local`** (local dev):
```
RESEND_FROM_EMAIL=noreply@yourdomain.com   # same domain works locally too
```

> **Note:** For local development, Resend will still send emails (the domain is verified
> globally, not per-environment). The dev console log of the reset URL still prints as well.

---

## Phase 6 — Test End-to-End

1. Deploy to Vercel after all env var and code changes
2. Visit `https://yourdomain.com` — confirm app loads
3. Test Google and Facebook OAuth sign-in — confirm callbacks work
4. Test credentials sign-in
5. Test password reset:
   - Go to `/forgot-password`
   - Submit a real email address
   - Confirm email arrives (from `noreply@yourdomain.com`)
   - Click link → reset password
   - Confirm redirect to `/sign-in?reset=success`
   - Confirm confirmation email arrives
6. Check Resend dashboard → Emails — confirm sends appear and show "Delivered"

---

## Phase 7 — Security Review

After all changes are deployed and tested, run `/security-review` to audit the
domain configuration, email handling, and any auth-related changes for security issues.

Key areas it should check:
- `AUTH_URL` is set correctly (affects CSRF protection and callback validation)
- `RESEND_FROM_EMAIL` is a domain-verified sender (not a shared domain)
- OAuth callback URLs are restricted to your domain only
- Email content does not leak sensitive data (tokens are in links, not visible text)

---

## Summary Checklist

- [ ] Domain purchased (Cloudflare Registrar recommended)
- [ ] Domain connected to Vercel + DNS records added
- [ ] `AUTH_URL` updated in Vercel env vars
- [ ] Google OAuth callback URL updated
- [ ] Domain verified in Resend + DNS records added
- [ ] `src/actions/auth.ts` updated to use `RESEND_FROM_EMAIL`
- [ ] `RESEND_FROM_EMAIL` set in Vercel env vars
- [ ] `RESEND_FROM_EMAIL` set in `.env.local`
- [ ] End-to-end test passed (app loads, OAuth works, reset email sends/arrives)
- [ ] `/security-review` run and findings addressed
