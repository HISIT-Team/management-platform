# HIS Management Platform — Next.js

Next.js (App Router, TypeScript) port of the H-FARM International School
Management Platform, previously a set of static HTML pages in `../netlify-package`.
The visual design is reproduced 1:1: the original `platform.css` is kept verbatim
as the global stylesheet, so hub/auth pages are pixel-identical, and the form
design system lives in `src/app/forms.css` (scoped under `.form-page`).

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **@supabase/supabase-js** for auth, profiles and the secure form submit
- **Cloudflare Turnstile** captcha on the auth flows
- Global CSS (no CSS framework) — same design tokens as the original

## Getting started

```bash
cp .env.example .env.local   # values are already filled in .env.local
npm install
npm run dev                  # http://localhost:3000
```

Build for production:

```bash
npm run build && npm start
```

## Environment variables

See `.env.example`. All are `NEXT_PUBLIC_*` (safe for the browser — access is
enforced by Supabase RLS):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`

## Project structure

```
src/
  app/
    globals.css            # original platform.css (hub/auth design system)
    forms.css              # form design system, scoped under .form-page
    layout.tsx             # metadata, favicons, manifest, theme-color
    page.tsx               # entry card / role-filtered dashboard (was index.html)
    login/ signup/ reset-password/   # auth pages (+ Turnstile)
    onboarding/            # employee onboarding form
    <hub>/page.tsx         # 12 hub routes, each rendering <HubPage config={…}>
  components/
    Header, Footer, Topbar, AuthGuard, HubPage, Turnstile
  lib/
    supabase.ts            # browser client (singleton, env-based)
    auth.ts                # HISAuth port (sign in/up, profiles, submitForm, checkAccess)
    hubs.tsx               # data-driven config for every hub page
```

Hub pages are data-driven: instead of 12 near-identical HTML files, each route
passes a `HubConfig` (title, roles, cards) to the shared `<HubPage>` — same
output, far less duplication.

## Routing note (Supabase redirect URLs)

Routes are now clean paths (no `.html`). Update the Supabase dashboard →
**Authentication → URL Configuration → Redirect URLs** accordingly:

| Original               | New               |
| ---------------------- | ----------------- |
| `/login.html`          | `/login`          |
| `/reset-password.html` | `/reset-password` |

## Backend (unchanged)

The Supabase Edge Function `submit-form`, the SQL migrations and the Power
Automate docs live in `../netlify-package/{supabase,docs}` and are reused as-is —
the app calls the same `submit-form` function.

## What's ported

The **entire** platform — all 23 pages — is ported 1:1:

- Auth: `index`/dashboard, `login`, `signup`, `reset-password` (Turnstile).
- 12 hub pages (data-driven via `src/lib/hubs.tsx`).
- All forms: `onboarding`, `modulo-student` & `modulo-employee` (QR scanner via
  `jsqr`, canvas signature pad, image compression, device photos/damage),
  `room-assignment`, `form-richiesta` (medicine consent), `special-diet-request`
  (conditional medical-certificate upload), `employee-management` (offboarding).

Shared form building blocks live in `src/components`: `SignaturePad`,
`QrScanner`, `DeviceCheckoutForm`, `useToast`, plus `src/lib/image.ts`.

## Roles

Every protected page is gated by `<AuthGuard roles={[…]}>`, matching the
original `HISAuth.requireAuth` roles exactly (`admin` always allowed):

| Area | Roles |
| --- | --- |
| boarding, room-assignment(-hub), request-medicines-hub | `boarding`, `admin` |
| it, it-registries-hub, student/employee check-in-out (+ modulo-\*) | `it`, `admin` |
| hr, hr-registry-hub, employee-management(-hub), onboarding | `hr`, `admin` |
| student-office | `office`, `admin` |
| parents-hub, form-richiesta, special-diet-request | `parent`, `admin` |

Role matching is case-insensitive. Unauthenticated → `/login`; wrong role → `/`.

## Transitions

Each route change replays a subtle enter animation on the page container
(`pageEnter` in `globals.css` / `forms.css`) — combined with the existing
staggered `rise` on headers, cards and sections it gives a smooth section-switch
feel. All animations are disabled under `prefers-reduced-motion`.
