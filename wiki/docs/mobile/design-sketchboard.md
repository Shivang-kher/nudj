---
sidebar_position: 4
title: Design Sketchboard
---

# Design Sketchboard

> **Sketchboard:** https://claude.ai/artifact/8S27fuay28KYKT1eK9TMHy
>
> Thirteen artboards — a foundations board plus six screens in both light and dark. This is the
> visual contract the tech spec (Step 2) is written against.

---

## What's on the canvas

| Artboard | Milestone | What it establishes |
|---|---|---|
| **Foundations** | — | Both palettes, type scale, rupee formatting rules, radii, components |
| **Sign in** · light + dark | M1 | Google-first sign-in, the in-app Gmail justification, phone fallback |
| **Home** · light + dark | M2–M4 | The product thesis in one screen: month spend, money about to leave, portfolio |
| **Spends** · light + dark | M2 | Donut + category legend, transaction rows, the swipe-to-recategorise affordance |
| **Upcoming** · light + dark | M3 | 30-day timeline, payment rails as badges, snooze, the balance-shortfall warning |
| **Portfolio** · light + dark | M4 | Value, estimated XIRR with its caveat, allocation, holdings, the disclaimer strip |
| **Assist** · light + dark | M5 | A factual answer with a tool-result card **and a designed refusal** |

---

## The design language

The reference set is Groww, Zerodha, INDmoney and Dhan — the conventions Indian users already
read fluently: large rounded cards, generous padding, one accent, tabular rupee figures, a
five-item bottom tab bar, and almost no chrome.

### Palette

Nudj's accent is a **ledger green** — close enough to the category to feel native, pulled
deeper and less mint than Groww's so it isn't a copy. The differentiator is the second colour:
an **ochre**, reserved exclusively for *money about to leave your account*. Nothing else in the
app is allowed to use it, which is why an upcoming-autopay tile reads as urgent without
shouting.

| Role | Light | Dark |
|---|---|---|
| ground | `#F4F6F5` | `#0D1210` |
| surface (cards) | `#FFFFFF` | `#161D1A` |
| tile / inset | `#EDF0EE` | `#1E2723` |
| border | `#E2E6E3` | `#2A332E` |
| ink | `#0E1613` | `#E9EDEA` |
| muted text | `#5F6B65` | `#9BA5A0` |
| faint text | `#737E78` | `#8B958F` |
| **accent** | `#0E7C63` | `#3FD6A8` |
| accent soft | `#DDEFE8` | `#12352C` |
| up / gain | `#0B7A54` | `#3FD6A8` |
| down / loss | `#C0392B` | `#F2785C` |
| **due** (ochre) | `#9A6B0E` | `#E0A94A` |
| due soft | `#F7EEDA` | `#2E2510` |

Every faint grey clears 4.5:1 on its own ground. `#737E78` was darkened from a lighter grey
specifically because caption-sized text at 3:1 is the most common accessibility failure in
finance apps.

### Light and dark are not inverses

Three things change structurally, not just in hue:

1. **Shadows become borders.** Light-theme cards sit on soft shadows; dark-theme cards use a
   1px `#2A332E` border, because a shadow on a dark ground is invisible.
2. **Chat bubbles flip role.** The user's bubble is near-black on light, and an accent-tinted
   `#1E3B33` on dark — a bright bubble on a dark ground is harsh.
3. **The accent brightens.** `#0E7C63` has the contrast for white-on-accent buttons in light;
   on dark it would disappear, so dark uses `#3FD6A8` with **dark** icon strokes on accent fills.

### Typography

Two faces, no more.

- **Plus Jakarta Sans** — everything a user reads. Geometric enough to feel like a product,
  warm enough not to feel like a dashboard.
- **IBM Plex Mono** — reserved for micro-labels, account numbers and as-of stamps. The places
  where a monospace signals *this is a record, not a claim*. Which matters in an app where the
  difference between a record and a claim is a compliance question.

| Role | Size | Weight |
|---|---|---|
| display (money) | 34 | 700, `-0.028em` |
| title | 20–21 | 700, `-0.02em` |
| body | 14–15 | 500–600 |
| caption | 11–13 | 400–500 |
| micro (mono, uppercase) | 9–10 | 400, `0.12em` |

### Rupee rules

- **Indian grouping, always.** `₹12,34,567` — never `₹1,234,567`. See the Hermes `Intl` caveat
  in [React Native Concepts §9](../react-native-concepts.md); this needs verifying on a real
  device in M0.
- **`font-variant-numeric: tabular-nums`** wherever amounts stack in a column.
- **Direction is carried by a glyph as well as colour** — `▲ ₹86,160` / `▼ ₹4,120` — so the
  number still reads for a colour-blind user. Green/red is kept because it is the Indian market
  convention, but it is never the *only* signal.

### Radii and spacing

| Element | Radius |
|---|---|
| cards | 20 |
| tiles, inner boxes | 14–18 |
| buttons | 16 |
| pills, chips, avatars | 999 / 12–13 |

16px page gutter, 20px card padding, 10–14px gaps. The "rounded, minimal" read comes from
radius plus padding plus restraint — not from shadows or gradients. Every touch target is at
least 44px tall.

---

## Three decisions worth arguing about

**1. The Home screen leads with money leaving, not money spent.**
A month-spend figure is backward-looking and every app has one. The ochre "Due in 7 days" tile
is the thing Nudj knows that the others do not. It is second only because the spend figure
orients you first.

**2. The Upcoming screen does arithmetic the user hasn't asked for.**
`₹13,300 is due from HDFC XX1234, which held ₹12,480 — short by ₹820.` That single line is the
whole product thesis: cross-referencing mandates against balances is something no amount of
manual tracking gives you. It is also strictly factual, so it raises no compliance question.

**3. Sign-in leads with Google, and the Gmail card is not reassurance copy.**
Gmail *is* the mandate data source, so one Google consent grants identity and mandate access
together — the user is never asked to "connect Gmail" as a second step, which removes a drop-off
point. The "Why Nudj asks for Gmail" card exists because **Google requires an in-app
justification before its own consent screen** for restricted scopes; designing it into sign-in is
part of passing that review. **Updated 2026-10-13:** the second button is now *"Use email instead"*, not phone. SMS OTP in
India needs DLT registration plus a paid provider; email OTP is free, instant and native to
Supabase, and still satisfies App Store Guideline 4.8. The WhatsApp number is linked after
sign-in instead, verified over the WhatsApp channel we already run.

**4. The refusal is a designed state, not an error.**
The Assist artboards deliberately show both halves — a real answer *and* a blocked prompt
("should I increase my SIP?"). The refusal is calm rather than alarming, it explains *why* in
one sentence, it hands over three things Nudj genuinely can say, and it routes to a
SEBI-registered adviser. Users will hit this often, because asking what to do with your money
is the obvious thing to ask a finance app. If it feels like a wall, the feature fails; if it
feels like a knowledgeable colleague declining to practise law, it works.

This is the screen [Step 5's compliance review](./lifecycle-framework.md) is measured against.

---

## What is not designed yet

Deliberately out of this round, to be added when their milestone comes up:

- The phone-OTP entry and verification steps behind "Use my phone number instead" (M1)
- The post-sign-in Gmail scan progress and first-results screen (M1)
- Transaction detail and manual-entry form (M2)
- Notification settings and the lock-screen push (M3)
- "How to get your CAS" guide and the upload progress state (M4)
- Holding detail with NAV sparkline (M4)
- Settings, DPDP consent, data export and delete (M6)
- Every empty, loading, error and offline state (M6)

The foundations board is enough to build all of them against, which is the point of having one.
