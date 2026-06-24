---
sidebar_position: 4
title: Prerequisites & Setup
---

# Prerequisites & Setup

Everything that needs to be in place before writing a single line of backend code.

---

## 1. WhatsApp Cloud API (Meta)

**Docs:** https://developers.facebook.com/docs/whatsapp/cloud-api/get-started

### Steps

1. **Create a Meta Developer account**
   - Go to https://developers.facebook.com
   - Sign in with a Facebook account → accept developer terms

2. **Create a Meta App**
   - Dashboard → **My Apps** → **Create App**
   - Use case: **Other** → App type: **Business**
   - Give it a name (e.g. "Nudj")

3. **Add WhatsApp to the app**
   - Inside your app → **Add a Product** → find **WhatsApp** → click **Set up**

4. **Create or link a WhatsApp Business Account (WABA)**
   - Follow the prompt to create a new WABA
   - You'll be assigned a free test phone number automatically

5. **Get your credentials**
   - Go to **WhatsApp → API Setup**
   - Copy **Phone Number ID** → `WHATSAPP_PHONE_ID`
   - Copy **Temporary access token** → `WHATSAPP_TOKEN`
     _(valid 24 hours; generate a permanent token later via System User — see below)_

6. **Generate a permanent token (System User token)**
   - Go to **Business Settings** (business.facebook.com) → **Users → System Users**
   - Create a System User → assign it **Admin** role on your app
   - **Generate token** → select your app → grant `whatsapp_business_messaging` + `whatsapp_business_management` permissions
   - Copy the token → this is your permanent `WHATSAPP_TOKEN`

7. **Register a webhook**
   - In **WhatsApp → Configuration → Webhook**
   - Set **Callback URL**: `https://yourdomain/webhook`
   - Set **Verify token**: any string you choose → `WHATSAPP_VERIFY_TOKEN`
   - Subscribe to field: `messages`
   - _(You need your server deployed before this step — come back here in Week 1)_

8. **Add a real phone number (when ready for beta)**
   - WhatsApp → Phone Numbers → **Add phone number**
   - Verify via SMS or call
   - Submit for **Meta Business Verification** to move out of test limits

### Limits (free tier)
| Limit | Value |
|---|---|
| Test messages | 1,000 free conversations/month |
| Recipients during testing | Only numbers added as test contacts |
| To message any number | App must be in **Live** mode (requires business verification) |

---

## 2. Google Cloud — Gmail API + OAuth

**Docs:** https://developers.google.com/gmail/api/quickstart/nodejs

### Steps

1. **Create a Google Cloud project**
   - Go to https://console.cloud.google.com
   - Top nav → project dropdown → **New Project**
   - Name it (e.g. "nudj-prod") → **Create**

2. **Enable the Gmail API**
   - In your project → **APIs & Services → Library**
   - Search **Gmail API** → click it → **Enable**

3. **Configure the OAuth consent screen**
   - **APIs & Services → OAuth consent screen**
   - User type: **External** (for real users outside your org)
   - Fill in:
     - App name: "Nudj"
     - User support email: your email
     - Developer contact email: your email
   - **Scopes** → Add scope → search and add:
     `https://www.googleapis.com/auth/gmail.readonly`
   - **Test users** → add your own Gmail address (needed while app is in Testing mode)
   - Save

4. **Create OAuth credentials**
   - **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type: **Web application**
   - Name: "Nudj Backend"
   - **Authorized redirect URIs** → add: `https://yourdomain/oauth/callback`
     _(also add `http://localhost:3000/oauth/callback` for local dev)_
   - **Create** → copy **Client ID** → `GOOGLE_CLIENT_ID` and **Client Secret** → `GOOGLE_CLIENT_SECRET`

5. **Publishing status**
   - While in **Testing** mode: only test users you've added can connect Gmail. Fine for beta (up to 100 users).
   - To go to production: **Publish App** → Google reviews it (7–10 days for sensitive scopes like `gmail.readonly`)
   - **Submit for verification early (Week 1)** — don't wait until launch

6. **Privacy Policy requirement**
   - Google requires a live Privacy Policy URL to approve the consent screen
   - Add a `/privacy` page to the Nudj wiki or deploy a simple static page
   - URL goes in the OAuth consent screen settings

---

## 3. Gemini API

**Docs:** https://ai.google.dev/gemini-api/docs/quickstart?lang=node

### Steps

1. **Get an API key**
   - Go to https://aistudio.google.com/apikey
   - **Create API key** → select your Google Cloud project
   - Copy the key → `GEMINI_API_KEY`

2. **Free tier limits**
   - Gemini 2.0 Flash: **1,500 requests/day**, **1M tokens/day** — more than enough for MVP
   - No billing required until you exceed free limits

3. **Enable Gemini API in Google Cloud (optional but recommended)**
   - In Google Cloud Console → **APIs & Services → Library**
   - Search **Generative Language API** → Enable
   - Links billing/quota to your project for easier monitoring

---

## 4. Supabase

**Docs:** https://supabase.com/docs/guides/getting-started

### Steps

1. **Create an account**
   - Go to https://supabase.com → **Start your project**
   - Sign in with GitHub

2. **Create a project**
   - **New project**
   - Name: "nudj"
   - Set a strong database password (save it — you'll need it for direct DB connections)
   - Region: **South Asia (Mumbai)** — closest to your users
   - Free tier → **Create new project**

3. **Get your credentials**
   - **Project Settings → API**
   - Copy **Project URL** → `SUPABASE_URL`
   - Copy **service_role** key (under Project API keys) → `SUPABASE_SERVICE_KEY`
     _(service_role bypasses RLS — only use server-side, never expose to clients)_

4. **Run the database schema**
   - Go to **SQL Editor** → paste the schema from the implementation plan → **Run**

5. **Enable Row Level Security**
   - After running the schema, run this for each table:
   ```sql
   alter table users enable row level security;
   alter table transactions enable row level security;
   alter table subscriptions enable row level security;
   alter table reminders enable row level security;
   alter table parsed_emails enable row level security;
   ```
   - The backend uses the `service_role` key which bypasses RLS — this protects against any accidental client-side exposure

6. **Free tier limits**
   | Limit | Value |
   |---|---|
   | Database size | 500 MB |
   | API requests | Unlimited |
   | Pause after inactivity | 7 days (project pauses if no activity) |

---

## 5. Railway (Hosting)

**Docs:** https://docs.railway.app/getting-started

### Steps

1. **Create an account**
   - Go to https://railway.app → **Login with GitHub**

2. **Create a project**
   - **New Project → Deploy from GitHub repo**
   - Select your `nudj-backend` repo
   - Railway auto-detects Node.js

3. **Set environment variables**
   - Project → your service → **Variables**
   - Add all vars from the `.env.example` file

4. **Set start command**
   - **Settings → Deploy → Custom start command**:
   ```
   npx tsx src/index.ts
   ```
   _(or `node dist/index.js` if you compile first with `tsc`)_

5. **Get a public URL**
   - **Settings → Networking → Generate Domain**
   - Use this as your `BASE_URL` and for the WhatsApp webhook + Google redirect URI

6. **Free tier limits**
   | Limit | Value |
   |---|---|
   | Free credits | $5/month |
   | RAM | 512 MB |
   | Estimated runtime at idle | ~500 hours/month (enough for MVP) |

---

## 6. Local Dev Setup

### Prerequisites
- Node.js 20+ — https://nodejs.org (use `nvm` to manage versions)
- Git

### Setup

```bash
# Clone repo
git clone https://github.com/yourname/nudj-backend.git
cd nudj-backend

# Install dependencies
npm install

# Copy env file
cp .env.example .env
# Fill in all values in .env

# Run database schema in Supabase SQL editor (one-time)

# Start dev server
npx tsx src/index.ts
```

### Expose localhost for webhook testing

Meta needs to reach your local server to test the webhook. Use a tunnel:

```bash
# Option 1 — ngrok (most common)
ngrok http 3000
# Copy the https URL → use as your webhook URL in Meta dashboard

# Option 2 — Cloudflare Tunnel (free, no time limit)
npx cloudflared tunnel --url http://localhost:3000
```

Update your `.env` and Meta webhook config every time the tunnel URL changes.

---

## Setup Order

Do these in sequence — some steps depend on earlier ones:

```
1. Supabase        → get DB running, run schema
2. Google Cloud    → enable Gmail API, create OAuth credentials
3. Gemini API      → get key (same Google account)
4. Meta / WhatsApp → create app, get test token
5. Local dev       → clone repo, fill .env, run server
6. ngrok           → expose localhost, register Meta webhook
7. Railway         → deploy, get public URL, update webhook + OAuth redirect URI
8. Gmail OAuth     → submit consent screen for Google verification
9. Meta Live mode  → submit business verification when ready for real users
```

---

## Accounts & Access Summary

| Service | Account type needed | Cost |
|---|---|---|
| Meta for Developers | Personal Facebook account | Free |
| Google Cloud | Google account | Free |
| Google AI Studio (Gemini) | Same Google account | Free |
| Supabase | GitHub account | Free |
| Railway | GitHub account | Free ($5 credit/month) |
| ngrok | Email signup | Free (limited tunnels) |
