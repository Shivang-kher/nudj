---
sidebar_position: 7
title: Pseudocode — M1
---

# Pseudocode — M1: Identity & the API spine

**Lifecycle step:** 3 of 7 (M1) · **Model:** Opus 5 · **Date:** 2026-11-16 (rev 2) · **Status:** Awaiting approval

> M1 in one sentence: **sign in with Google, and get back your own data from your own backend.**
>
> One authenticated round trip, end to end. Every later milestone is a variation on it.

Reviewable artifact: https://claude.ai/artifact/2pkGQWqKKDzDo6kYUya9nz

Built against: [Tech Spec](./tech-spec.md) §3 · [Design Sketchboard](./design-sketchboard.md) ·
[M0](./pseudocode-m0.md)

---

## Four findings that change M1

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

### 3. Google sign-in reuses the existing Web client — no native clients

Revised 2026-11-16, replacing rev 1's iOS + Android OAuth clients.

The app would have needed the Web client **anyway**, because the backend is what reads Gmail and
therefore what must hold the refresh token. Native clients would have meant three OAuth clients
and two sign-in code paths for one product.

So: **one Web client, backend-mediated.** The app opens the system browser at the backend, Google
redirects to the backend's existing `/oauth/callback`, and the backend deep-links back into the
app with a one-time handoff code. The client secret never leaves the server.

| | rev 1 (native PKCE) | rev 2 (backend-mediated) |
|---|---|---|
| OAuth clients | 3 | 1, already exists |
| Secret in the app bundle | no (PKCE) | no (never sent) |
| Sign-in code paths | 2 | 1 |
| Consent UI | native sheet | browser page |
| Console setup | iOS + Android + SHA-1 | none |

The cost is the native "Continue as …" sheet. Worth it.

**Sign-in asks only for `openid`, `email`, `profile`.** Gmail access is a *separate, later*
consent, when the user actually connects an inbox — what Google calls incremental consent. Asking
for someone's entire inbox on the login screen is how you get people to bounce, and it is what
rev 1 did.

### 4. The Google project is in Testing, and the backend has no stable address

Both verified in the console on 2026-11-16. Neither blocks M1. Both block shipping.

**Publishing status: Testing · External · 2 of 100 users.**

- Only listed test users can sign in at all.
- **Refresh tokens issued under Testing expire after 7 days.** The backend encrypts and stores
  Gmail refresh tokens, so they die weekly and the email scan stops silently. If ingestion has
  been going quiet after about a week, this is the first thing to check — the logs decide it, not
  this document.
- All three scope tables were **empty** before this revision. `gmail.readonly` is still
  undeclared: it is a *restricted* scope, and declaring it starts Google's CASA security
  assessment. Deliberately left alone — that is a decision with a budget and a calendar attached,
  not a checkbox.

**`GOOGLE_REDIRECT_URI` is a free ngrok tunnel** (`…ngrok-free.dev`). The hostname changes on
every restart and Google matches redirect URIs exactly. Survivable for a bot only you test; not
survivable for a phone app. Task 0.

:::note These are M6 compliance work, listed here on purpose
M1 is built knowing about them; M1 does not fix them. The single exception is the redirect URI,
which M1 genuinely cannot work around.
:::

---

## Setup — status as of 2026-11-16

Three of rev 1's four console tasks are **done**. Two were dropped with the native clients.

| Task | Status |
|---|---|
| Google → Data Access → add `openid`, `email`, `profile` | **done**, verified after reload |
| Google → two native OAuth clients | **dropped** — finding 3 |
| Google → Android SHA-1 via `eas credentials` | **dropped** — finding 3 |
| Supabase → email provider | already on |
| Supabase → magic links & email OTP | already on |
| Supabase → OTP length 8 → **6** | **done** — sketchboard shows 6 boxes |
| Supabase → OTP expiry 3600s → **600s** | **done** |
| Supabase → template sends `{{ .Token }}`, not a link | **done** |
| Supabase → anon key + JWT secret into `.env` | **outstanding, yours** |

The saved template:

```html
<h2>Your Nudj sign-in code</h2>
<p>Enter this code in the Nudj app:</p>
<p style="font-size:28px;letter-spacing:6px;font-weight:700">{{ .Token }}</p>
<p>It expires in 10 minutes. If you didn't request it, you can ignore this email.</p>
```

Without `{{ .Token }}` the app asks for six digits while the email hands the user a link. Supabase
ships the link version by default, so this is a silent trap rather than a nicety.

:::warning Supabase's built-in email sender is rate-limited
The dashboard states it "is not meant to be used for production apps" — a few messages an hour.
Fine while you are the only person signing in. The moment real users are, OTPs stop arriving and
nothing raises an error. Real SMTP (Resend, SES) before ship. M6.
:::

New env vars:

```
# nudj-backend/.env
SUPABASE_JWT_SECRET=...
APP_REDIRECT_SCHEME=nudj
# GOOGLE_CLIENT_ID / _SECRET / _REDIRECT_URI already exist and are unchanged

# nudj-mobile/.env
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
EXPO_PUBLIC_API_URL=...          # Task 0
```

Note what is **no longer** here: no `GOOGLE_IOS_CLIENT_ID`, no `GOOGLE_ANDROID_CLIENT_ID`, no
Google client id in the app at all. The app never speaks to Google directly.

The anon key is public by design — it only ever reaches Supabase Auth, never your data, because
the app talks to Hono for everything else. The JWT secret is **not** public: it belongs in `.env`
and nowhere else — not in a commit, not in `app.config.ts`, not pasted into a chat.

---

## Backend

### Task 0 — Give the backend a stable address

M1 cannot run on a rotating hostname: Google matches `redirect_uri` exactly, and the app ships
`EXPO_PUBLIC_API_URL` baked into the build.

Pick one:

- **Deploy** to Railway / Render / Fly — the free tier covers this comfortably.
- **Reserved ngrok domain**, about $10/mo, keeps the tunnel and fixes the hostname.

Recommended: deploy. The app needs a reachable backend regardless, and otherwise every M1 test run
starts with tunnel admin.

Then in Google Cloud → Clients → the **Web** client, set Authorized redirect URIs to
`https://<host>/oauth/callback`, and update `GOOGLE_REDIRECT_URI` and `BASE_URL` to match.

**Done when** `curl https://<host>/health` returns 200 twice, a day apart, with nothing restarted
in between.

---

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

-- carries a finished browser sign-in back into the app (Task 8)
create table auth_handoffs (
  id          uuid primary key default gen_random_uuid(),
  state       text not null unique,     -- what the app sent, round-tripped through Google
  code_hash   text,                     -- sha256 of the one-time handoff code
  platform    text not null check (platform in ('ios','android')),
  payload     jsonb,                    -- the Supabase token_hash, written at callback
  expires_at  timestamptz not null,     -- 2 minutes
  consumed_at timestamptz,
  created_at  timestamptz default now()
);
create index auth_handoffs_expiry_idx on auth_handoffs (expires_at) where consumed_at is null;

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

  // TWO scope sets, not one. Incremental consent — finding 3.
  SIGNIN_SCOPES = ['openid', 'email', 'profile']
  GMAIL_SCOPES  = [...SIGNIN_SCOPES,
                   'https://www.googleapis.com/auth/gmail.readonly']

  getAuthUrl(state, { wantGmail })
    scope: wantGmail ? GMAIL_SCOPES : SIGNIN_SCOPES
    include_granted_scopes: true     // keeps Gmail access already granted
    access_type: 'offline'

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

POST /api/v1/auth/google/start           // unauthenticated — this IS the sign-in
     body { platform: 'ios'|'android' }
     -> state = 32 random bytes
     -> INSERT auth_handoffs (state, platform, expires_at = now() + 2 min)
     -> { authUrl: getAuthUrl(state, { wantGmail: false }), state }

GET  /oauth/callback?code&state          // EXISTING route, now serving two flows
     IF state matches an auth_handoffs row  (app sign-in):
        exchange the code with the Web client      // secret never leaves this process
        verify the id_token against Google's JWKS -> { sub, email, name }
        resolveIdentity({ googleSub: sub, email })            (Task 4)
        ensure a Supabase auth user exists for that email:
            admin.getUserByEmail  ||  admin.createUser({ email, email_confirm: true })
        link = admin.generateLink({ type: 'magiclink', email })
        handoffCode = 32 random bytes
        UPDATE the row  code_hash = sha256(handoffCode),
                        payload   = { token_hash: link.hashed_token }
        302 -> nudj://auth/callback?state=<state>&code=<handoffCode>
     ELSE  (legacy WhatsApp Gmail connect): unchanged

POST /api/v1/auth/google/complete        // unauthenticated
     body { state, code }
     -> row = SELECT … WHERE state = state
        REJECT 410 IF consumed_at IS NOT NULL        // single use
        REJECT 410 IF expires_at < now()             // 2 minutes
        REJECT 401 IF sha256(code) != code_hash      // constant-time compare
        mark consumed in the same statement that reads it
     -> { tokenHash: row.payload.token_hash }
     // the app then calls supabase.auth.verifyOtp({ token_hash, type: 'magiclink' })
     // and holds a real Supabase session, refresh included — same path as email OTP

POST /api/v1/gmail/connect               // AUTHENTICATED — the separate, later consent
     -> { authUrl: getAuthUrl(state, { wantGmail: true }) }
     -> on callback: encrypt + store tokens, kick off processUserEmails()

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
RUN  npx expo install expo-crypto expo-web-browser     # no expo-auth-session — Task 8
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

### Task 8 — Google sign-in, through the backend

The app holds no Google client id, no secret, and no Google token. It opens a URL and waits for a
deep link.

```
FILE src/lib/auth/google.ts

FUNCTION signInWithGoogle()
  { authUrl, state } = await POST /api/v1/auth/google/start { platform: Platform.OS }

  result = await WebBrowser.openAuthSessionAsync(authUrl, 'nudj://auth/callback')
  // openAuthSessionAsync uses SFAuthenticationSession / Custom Tabs.
  // NEVER a WebView: Google blocks them, and a WebView can read what the user types.

  IF result.type !== 'success' -> RETURN { cancelled: true }    // leaves NO session

  { state: returned, code } = parseQuery(result.url)
  IF returned !== state -> throw AuthError('state mismatch')    // an attack, not a glitch

  { tokenHash } = await POST /api/v1/auth/google/complete { state, code }

  await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' })
  // -> a real Supabase session, persisted via Task 7's chunked SecureStore adapter
```

Three properties must hold, each with a test in the Tests section:

1. The returned `state` equals the one sent. A mismatch aborts — it is never retried.
2. The handoff code is single-use and lives 2 minutes. Replaying it returns 410, not a session.
3. Cancelling the browser leaves no session **and** no half-created user row.

`app.config.ts` already declares `scheme: 'nudj'` from M0, so the deep link needs no new native
config — but the dev client must be rebuilt once for the scheme to register.

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

The dashboard is already configured for **6 digits, 600s expiry**, and the template sends
`{{ .Token }}`. The code-entry UI is therefore **6 boxes**, matching the sketchboard — not 8.

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
  google handoff: happy · replayed code -> 410 · expired code -> 410
                  · wrong code -> 401 · unknown state -> 410
                  · two concurrent /complete on one code -> exactly one session
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
2. **Continue with Google** → the system browser opens (expected — finding 3), you consent,
   and it closes itself and returns you to the app
3. Home greets you by name and lists your connected Gmail
4. Kill and relaunch → **straight to Home**, no sign-in bounce, no flash of the sign-in screen
5. Background 60s, return → Face ID prompt → unlock
6. Link your WhatsApp number → code arrives **on WhatsApp** → verified
7. Sign in on the *other* platform with the same Google account → **same account**, not a duplicate
8. Start **Continue with Google**, then dismiss the browser without consenting → back on the
   sign-in screen, still signed out, and no new user row was created
9. **The real one:** if you previously used the WhatsApp bot with this number, Home shows your
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
- `/oauth/callback` now serves **two** flows. The legacy branch keys off `state` being a phone
  number; the new one off a matching `auth_handoffs` row. Do not reorder those checks, and do not
  delete the legacy branch — the WhatsApp bot is in production.
- The Google client secret stays server-side. If any task finds itself wanting it in
  `nudj-mobile/`, that task has been misread.
