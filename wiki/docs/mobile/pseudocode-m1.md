---
sidebar_position: 7
title: Pseudocode — M1
---

# Pseudocode — M1: Identity & the API spine

**Lifecycle step:** 3 of 7 (M1) · **Model:** Opus 5 · **Date:** 2026-10-13 · **Status:** Awaiting approval

> M1 in one sentence: **sign in with Google, and get back your own data from your own backend.**
>
> One authenticated round trip, end to end. Every later milestone is a variation on it.

Reviewable artifact: https://claude.ai/artifact/2pkGQWqKKDzDo6kYUya9nz

Built against: [Tech Spec](./tech-spec.md) §3 · [Design Sketchboard](./design-sketchboard.md) ·
[M0](./pseudocode-m0.md)

---

## Two findings that change M1

### 1. Multi-account Gmail is broken in production right now

`getAuthUrl()` in `services/gmail.ts` requests **only** `gmail.readonly`. It never asks for
`openid`, `email` or `profile`, and nothing anywhere else fetches the account's address. So in
`routes/oauth.ts`:

```ts
const email = (tokens as { email?: string }).email ?? ''   // always ''
```

`addGmailAccount()` then upserts on `(user_id, email)` — and since every row has `email = ''`,
**a user's second Gmail account overwrites their first** instead of being added. Connecting
"work" Gmail silently destroys the tokens for "personal".

M1 has to fix this regardless, because identity resolution needs `google_sub` and `email` from
the ID token. Task 2.

### 2. Phone OTP is replaced by email OTP

SMS OTP in India needs DLT registration with the telecom operators plus a paid provider. Decided
2026-10-13: **Google sign-in primary, email OTP as the second option** — free, instant, natively
supported by Supabase, and it satisfies App Store Guideline 4.8's want for a non-third-party
login.

The WhatsApp number is no longer a login. It is **linked after sign-in**, verified by a code sent
over the WhatsApp channel you already run, at zero cost. The sign-in screen's secondary button
changes from *"Use my phone number instead"* to *"Use email instead"*.

---

## Setup you must do before Task 1

These are console tasks, not code. Nothing in M1 runs without them.

1. **Google Cloud → Credentials → two new OAuth clients:** one **iOS** (bundle id
   `com.nudj.app`) and one **Android** (package `com.nudj.app`, plus the SHA-1 from
   `eas credentials`). These are "installed app" clients with **no secret** — correct, because
   nothing secret can live in an app bundle. The existing Web client stays for the WhatsApp flow.
2. **Google Cloud → OAuth consent screen → add scopes** `openid`, `email`, `profile` alongside
   `gmail.readonly`.
3. **Supabase → Authentication → Providers → Email:** enable, and turn **off** "Confirm email"
   magic links in favour of the 6-digit OTP.
4. **Supabase → Settings → API:** copy the JWT secret and the anon key.

New env vars:

```
# nudj-backend/.env
SUPABASE_JWT_SECRET=...
GOOGLE_IOS_CLIENT_ID=...
GOOGLE_ANDROID_CLIENT_ID=...

# nudj-mobile/.env
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=...
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=...
```

The anon key is public by design — it only ever reaches Supabase Auth, never your data, because
the app talks to Hono for everything else.

---

## Backend

### Task 1 — Migration 002

```sql
alter table users
  add column auth_user_id uuid unique,
  add column google_sub   text unique,
  add column email        text,
  add column display_name text,
  add column phone_verified_at timestamptz;

alter table users alter column whatsapp_number drop not null;   -- app-first users have none
create index users_email_idx on users (lower(email));

create table phone_link_codes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  phone       text not null,
  code_hash   text not null,            -- sha256, never the code itself
  attempts    int  default 0,
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  created_at  timestamptz default now()
);
create index phone_link_codes_user_idx on phone_link_codes (user_id, created_at desc);

-- RLS on every table (defence-in-depth; the service key bypasses it — see tech spec §4)
alter table users enable row level security;
-- …repeat for all tables, policy: user_id = auth.uid() via auth_user_id
```

**Run it against local Postgres first** (`brew services start postgresql@17`), not straight into
Supabase. M0's lesson applies: execute, don't eyeball.

**Done when** the migration applies cleanly twice in a row (idempotent) and existing rows survive.

---

### Task 2 — Fix the Gmail OAuth scope bug

```
EDIT services/gmail.ts

  getAuthUrl(state)
    scope: ['openid', 'email', 'profile',
            'https://www.googleapis.com/auth/gmail.readonly']

  NEW  decodeIdToken(idToken) -> { sub, email, name, picture }
       // verify against Google's JWKS, do not trust-parse
       // googleapis: client.verifyIdToken({ idToken, audience })

  exchangeCode(code) -> { tokens, profile }
       tokens  = client.getToken(code).tokens
       profile = decodeIdToken(tokens.id_token)       // sub + email now available
       RETURN { tokens, profile }

EDIT routes/oauth.ts
  const { tokens, profile } = await exchangeCode(code)
  email = profile.email                               // no longer ''
```

**Backfill the damage:**

```
SCRIPT src/scripts/backfillGmailEmails.ts
  FOR each user_gmail_accounts row WHERE email = '' OR email IS NULL
    decrypt tokens -> call Google userinfo with the access token
    IF it resolves  -> UPDATE the row's email
    IF it 401s      -> mark the row stale; that account must reconnect
  REPORT how many fixed, how many need reconnecting
```

:::warning Be honest with affected users
Any user who connected two Gmail accounts has lost the first one's tokens — the row was
overwritten, not duplicated. The backfill cannot recover what was overwritten. Those users must
reconnect, and the fix should say so plainly rather than quietly re-prompting.
:::

**Done when** a fresh connect stores a real address, and the backfill script reports its counts.

---

### Task 3 — `/api/v1` and the auth middleware

```
FILE src/api/middleware/auth.ts
  verify the Supabase JWT with jose, HS256, SUPABASE_JWT_SECRET
  ON failure -> 401 { error: { code: 'unauthenticated' } }
  ON success -> resolveIdentity(claims)  (Task 4)  -> c.set('user', row)

FILE src/api/middleware/limit.ts
  in-memory token bucket keyed by user id
  120 req/min general · 10/min uploads · 20/day on /assist (M5)
  over -> 429 + Retry-After

FILE src/api/router.ts
  mounts /v1/* behind auth, except nothing — every route needs it

EDIT src/index.ts
  app.route('/api', api)      // beside /webhook, /oauth, /health
```

Error envelope, every failure, no exceptions:
`{ error: { code, message, requestId } }`

---

### Task 4 — Identity resolution

The part that must not be wrong. Tech spec §3's five steps, in one transaction.

```
FILE src/services/identity.ts

FUNCTION resolveIdentity({ authUserId, googleSub, email, phone }) -> User
  BEGIN TRANSACTION
    1  row = SELECT … WHERE auth_user_id = authUserId
       IF found RETURN row

    2  row = SELECT … WHERE google_sub = googleSub
       IF found -> UPDATE auth_user_id; RETURN row

    3  acct = SELECT user_id FROM user_gmail_accounts WHERE lower(email) = lower(email)
       IF found -> UPDATE that user's auth_user_id + google_sub; RETURN row

    4  IF phone given
         row = SELECT … WHERE whatsapp_number = phone
         IF found -> UPDATE auth_user_id; RETURN row

    5  INSERT a new row
  COMMIT

  ON unique-violation anywhere -> ROLLBACK and throw IdentityConflict
     // DO NOT guess. A wrong merge joins two people's finances.
     // Surface 409 { code: 'identity_conflict' } and alert — a human decides.
```

**Done when** the seven cases in Task 12 all pass.

---

### Task 5 — Endpoints

```
GET  /api/v1/me
     -> { id, displayName, email, whatsappNumber, phoneVerified,
          gmailAccounts: [{ email, connectedAt }],
          onboardingStep, createdAt }

POST /api/v1/auth/google/exchange
     body { code, codeVerifier, redirectUri, platform: 'ios'|'android' }
     -> pick the iOS or Android client id by platform (neither has a secret)
     -> exchange with PKCE, verify the id_token, encrypt + store tokens
     -> resolveIdentity(...)
     -> kick off processUserEmails() in the background
     -> { user, gmailConnected: true }

POST /api/v1/auth/link-whatsapp/start
     body { phone }   // E.164
     -> 6-digit code, store sha256 only, 10-min expiry, max 5 attempts
     -> sendMessage(phone, "Your Nudj code is NNNNNN")   // existing channel, free
     -> { sent: true }        // never echo the code back

POST /api/v1/auth/link-whatsapp/verify
     body { phone, code }
     -> compare hashes, check expiry + attempts
     -> on match: set whatsapp_number + phone_verified_at
     -> IF that number already belongs to another user -> 409 identity_conflict
     -> { linked: true }

DELETE /api/v1/auth/gmail/:email
     -> revoke with Google, delete the row
```

:::note The link endpoint is a merge in disguise
If the phone being linked already exists on a bot-created row, that is the same merge problem as
Task 4 step 4 — and here two *populated* accounts could collide. Refuse with 409 and let a human
resolve it. Never auto-merge two accounts that both hold transactions.
:::

---

## App

### Task 6 — Supabase client and API client

```
RUN  npx expo install @supabase/supabase-js @react-native-async-storage/async-storage
RUN  npx expo install expo-auth-session expo-crypto expo-web-browser
RUN  npx expo install expo-secure-store expo-local-authentication
RUN  npm i @tanstack/react-query zustand

FILE src/lib/supabase.ts
  createClient(url, anonKey, { auth: {
    storage: secureStoreAdapter,      // Task 8
    autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } })

FILE src/api/client.ts
  FUNCTION api(path, init)
    token = (await supabase.auth.getSession()).data.session?.access_token
    res   = fetch(EXPO_PUBLIC_API_URL + '/api/v1' + path, { …, Authorization: Bearer token })
    IF !res.ok -> throw ApiError(body.error.code, body.error.message, res.status)
    RETURN res.json()

FILE src/api/me.ts     getMe(): Promise<Me>
```

---

### Task 7 — Secure session storage, and the limit that bites

```
FILE src/lib/secureStore.ts

// SecureStore caps a value at ~2KB and on some platforms the write FAILS SILENTLY.
// A Supabase session with a Google id_token exceeds it. So: chunk, and verify.

FUNCTION setItem(key, value)
  chunks = split value into 1800-char pieces
  write  chunk count to `${key}__n`, then each `${key}__i`
  READ IT BACK and compare           // the assertion the tech spec demands
  IF mismatch -> throw StorageError('SecureStore write did not persist')

FUNCTION getItem(key)
  n = read `${key}__n`; IF absent RETURN null
  RETURN concat of the n chunks

FUNCTION removeItem(key)  delete every chunk and the count
```

**Done when** a deliberately oversized value round-trips, and a simulated failure throws rather
than returning silently.

---

### Task 8 — Google sign-in, PKCE, no secret in the app

```
FILE src/lib/auth/google.ts

  redirectUri = AuthSession.makeRedirectUri({ scheme: 'nudj', path: 'auth/google' })
  clientId    = Platform.OS === 'ios' ? IOS_CLIENT_ID : ANDROID_CLIENT_ID

  request = AuthSession.useAuthRequest({
    clientId, redirectUri,
    scopes: ['openid','email','profile',
             'https://www.googleapis.com/auth/gmail.readonly'],
    usePKCE: true,
    extraParams: { access_type: 'offline', prompt: 'consent' },
  }, Google.discovery)

  ON success(code)
    POST /auth/google/exchange { code, codeVerifier: request.codeVerifier,
                                 redirectUri, platform }
    -> backend does the exchange and keeps the refresh token
    -> then supabase.auth.signInWithIdToken({ provider:'google', token: id_token })
       so Supabase issues the session the API middleware verifies
```

**Never** a `WebView` — Google blocks it, and an in-app WebView can read what the user types.
`expo-auth-session` uses `SFAuthenticationSession` / Custom Tabs, which cannot.

---

### Task 9 — Email OTP

```
FILE src/lib/auth/email.ts
  sendCode(email)    -> supabase.auth.signInWithOtp({ email,
                          options: { shouldCreateUser: true } })
  verifyCode(email, token)
                     -> supabase.auth.verifyOtp({ email, token, type: 'email' })
  // then GET /me — the backend resolves identity from the JWT's email claim
```

---

### Task 10 — Routing gate and the sign-in screen

```
FILE src/app/_layout.tsx
  session = useSession()                    // Zustand, fed by supabase.auth.onAuthStateChange
  IF session === undefined -> splash        // still restoring; do NOT redirect yet
  IF session === null      -> Redirect to /(auth)/sign-in
  ELSE                     -> <Stack> with (tabs)

FILE src/app/(auth)/sign-in.tsx
  BUILD EXACTLY the sketchboard's Sign-in artboard:
    brand block · sample alert card · the "Why Nudj asks for Gmail" card (3 rows) ·
    Continue with Google · "Use email instead" · T&C + non-adviser line
  The Gmail card is REQUIRED — Google wants an in-app justification before its consent screen.

FILE src/app/(auth)/email.tsx       email entry -> code entry -> done
```

The `session === undefined` case matters: redirecting before the stored session has loaded
bounces a signed-in user to sign-in on every cold start.

---

### Task 11 — Biometric lock

```
FILE src/lib/auth/lock.ts
  ON AppState 'active' AND last background > 60s AND lockEnabled
    LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock Nudj' })
    IF fail -> keep the lock overlay up; offer retry or sign out
  IF no biometric hardware/enrolment -> fall back to device passcode
  IF neither -> skip silently, never lock the user out of their own data
```

---

### Task 12 — Home shows real data

Replace M0's smoke card: greet by `displayName`, list connected Gmail accounts, show whether the
WhatsApp number is linked, with a button to link it. **Keep the `Intl grouping` line** — it is
still the cheapest way to see which formatting path is live on a given device.

---

## Tests

```
BACKEND (vitest or node:test, against local Postgres)
  identity: 1 auth_user_id hit · 2 google_sub hit · 3 email hit via gmail accounts
            4 phone hit · 5 fresh create · 6 conflicting unique -> IdentityConflict
            7 concurrent sign-in of the same user -> one row, not two
  jwt middleware: valid · expired · wrong signature · missing -> 401
  link-whatsapp: happy · wrong code · expired · 6th attempt blocked
                 · number owned by another user -> 409
  rate limit: 121st request in a minute -> 429

APP (jest + RNTL)
  secureStore: oversized value round-trips · failed write throws
  auth gate: undefined -> splash · null -> sign-in · session -> tabs
  sign-in screen renders the Gmail justification card   // compliance, not cosmetics
```

**Gate:** all green, plus `tsc` 0 errors.

---

## Exit test — on your phone

1. Fresh install → sign-in screen, with the Gmail justification card visible
2. **Continue with Google** → system browser (not an in-app page) → consent → back in the app
3. Home greets you by name and lists your connected Gmail
4. Kill and relaunch → **straight to Home**, no sign-in bounce, no flash of the sign-in screen
5. Background 60s, return → Face ID prompt → unlock
6. Link your WhatsApp number → code arrives **on WhatsApp** → verified
7. Sign in on the *other* platform with the same Google account → **same account**, not a duplicate
8. **The real one:** if you previously used the WhatsApp bot with this number, Home shows your
   existing data — not an empty new account

---

## Notes for whoever executes this

- **Re-check the scaffold and package versions at execution time**, not from this doc. M0 proved
  Expo's surface moves within days.
- `expo-auth-session`, `expo-secure-store`, `expo-local-authentication` are **native** — add them
  all, then rebuild the dev client **once**.
- No Drizzle, no SQLite, no offline cache yet. That is M2.
- Identity conflicts **fail loudly**. Never auto-merge two accounts that both hold transactions.
- The backend must keep working for WhatsApp-only users throughout. `whatsapp_number` becoming
  nullable must not break `upsertUser` or the webhook.
