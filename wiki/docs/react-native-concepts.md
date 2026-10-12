---
sidebar_position: 8
title: React Native Concepts
---

# React Native Concepts

> A living reference for the React Native concepts Nudj actually uses, explained against
> the Nudj code that uses them. It grows one section per milestone — see the
> [Lifecycle Framework](./mobile/lifecycle-framework.md).
>
> Sections are marked **M0**–**M7** by the milestone that introduces them. Anything marked
> *(ahead)* is written but not yet exercised in code, so treat the code sketches as
> intent rather than as the final shape.

---

## 1. The runtime — what is actually running your JavaScript · M0

This is the part that most confuses people coming from web, and getting it straight makes
everything else make sense.

**There is no browser.** No DOM, no `window`, no CSS engine, no HTML. Your JavaScript runs
in a standalone JS engine embedded in a native iOS or Android app, and React Native's job
is to translate your React component tree into real native views — `UIView` on iOS,
`android.view.View` on Android.

```
Your TSX              React reconciler         Native view tree
<View>          →     "host component          UIView / ViewGroup
  <Text>              View with these   →      UILabel / TextView
</View>               props"
```

### Hermes — the engine

Hermes is the JS engine, and the default since React Native 0.70. Two things matter about
it:

- **It compiles your JS to bytecode at build time**, not at app launch. That is why RN
  apps start fast despite shipping a whole JS bundle — there is no parse step on device.
- **It is not V8 or JavaScriptCore**, so engine-specific behaviour can differ. The one you
  will actually hit in Nudj is `Intl` support, which matters because we format rupees
  everywhere — see §9.

### JSI, Fabric, TurboModules — and why "the bridge" is historical

You will read a lot of older material about "the bridge": a queue that serialised every
JS↔native call to JSON and passed it asynchronously. It was the defining performance
constraint of old React Native, and it is gone.

| Thing | What it is |
|---|---|
| **JSI** | JavaScript Interface. A thin C++ layer that lets JS hold direct references to native objects and call them **synchronously**. The foundation for everything below. |
| **Fabric** | The new renderer, built on JSI. Maintains the view tree in C++ and can do layout synchronously. |
| **TurboModules** | The new native-module system. Modules are typed via codegen and loaded lazily rather than all at startup. |

Together these are "the New Architecture", default since RN 0.76. The practical upshots
for us: Reanimated and Skia can run animation entirely on the UI thread, so a chart
gesture never waits for JS; and when you read advice about "avoiding bridge traffic", it is
usually about a problem you no longer have.

### Metro — the bundler

Metro is RN's bundler, the Webpack/Vite equivalent. It resolves your imports, transforms
TSX, and serves a bundle to the dev client over HTTP with Fast Refresh. Two behaviours
worth knowing:

- Metro has **platform-aware resolution**. `Button.ios.tsx` and `Button.android.tsx` are
  picked automatically for `import Button from './Button'`. `.native.tsx` beats `.tsx` for
  both platforms.
- Metro does **not** do tree-shaking the way Webpack does. Importing one helper from a big
  library can pull most of it in. Relevant when we audit bundle size in M6.

### The three threads

| Thread | Runs |
|---|---|
| **JS thread** | Your components, hooks, business logic, network calls |
| **UI (main) thread** | Actual rendering, touch handling, native animations |
| **Shadow / background** | Yoga layout computation |

The mental model to keep: **a blocked JS thread does not freeze scrolling, but it does
freeze anything your JS has to answer.** A heavy `reduce` over 5,000 transactions will not
stutter a native scroll, but it will delay the row that is waiting on its result.

---

## 2. Core components — the vocabulary · M0

There are far fewer primitives than on web, and that is a feature.

| Component | Web analogue | Notes |
|---|---|---|
| `View` | `div` | A flex container. Cannot contain bare strings. |
| `Text` | `span`/`p` | **All text must be inside a `Text`.** The one component with style inheritance. |
| `Pressable` | `button`/`a` | The modern touchable. Gives you pressed state, hit-slop, long-press. Prefer it over the older `TouchableOpacity`. |
| `ScrollView` | `div` with `overflow:scroll` | Renders **all** children immediately. Fine for a settings screen, wrong for a transaction list. |
| `FlatList` | — | Virtualised list. See §6. |
| `TextInput` | `input` | Controlled, but keyboard behaviour is platform-specific. |
| `Image` | `img` | Needs explicit dimensions or a flex context; does not size itself from the file. |
| `Modal` | `dialog` | Native modal presentation. |

```tsx
// ✗ Crashes — a bare string cannot be a child of View
<View>₹1,240</View>

// ✓
<View>
  <Text>₹1,240</Text>
</View>
```

---

## 3. Styling — it looks like CSS and is not CSS · M0

Styles are plain JS objects. `StyleSheet.create` validates them and gives you a stable
reference (useful for memoisation), but you can pass raw objects too.

```tsx
const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  amount: { fontVariant: ['tabular-nums'], fontWeight: '600' },
})
```

### The five differences that will bite you

1. **`flexDirection` defaults to `column`**, not `row`. This is the single most common
   source of "why is my layout stacked".
2. **There is no cascade and no inheritance.** A `color` on a `View` does nothing to the
   `Text` inside it. The one exception is nested `Text`, which does inherit text styles.
3. **Numbers are density-independent points, not pixels.** `padding: 16` is 16pt, which is
   16 physical pixels at 1x and 48 at 3x. There are no units, and `'16px'` is invalid.
4. **No `%` on most properties, no `vh`/`vw`, no `calc()`, no media queries.** You get
   `Dimensions`, `useWindowDimensions()`, and flex. Breakpoints are JS conditionals.
5. **A lot of CSS simply does not exist.** No `float`, no `grid`, no pseudo-selectors, no
   `box-shadow` (use `shadow*` on iOS and `elevation` on Android, or a library). `overflow:
   hidden` on Android has historically clipped unreliably with `borderRadius`.

### Theming — how Nudj does it

No CSS variables, so tokens are a module and the theme is resolved in JS:

```ts
// src/theme/tokens.ts
export const light = { ground: '#F4F6F5', ink: '#0E1613', accent: '#0E7C63', due: '#9A6B0E' }
export const dark  = { ground: '#0D1210', ink: '#E9EDEA', accent: '#3FD6A8', due: '#E0A94A' }

// src/theme/useTheme.ts
import { useColorScheme } from 'react-native'
export const useTheme = () => (useColorScheme() === 'dark' ? dark : light)
```

The full token set is in the [Design Sketchboard](./mobile/design-sketchboard.md); those four
are the shape of it.

Because there is no cascade, **every component that draws a colour must read the theme
itself.** That is more verbose than CSS and it is also why RN theming never silently
half-applies.

### Safe areas

Notches, Dynamic Island, home indicators and Android navigation bars all intrude on the
screen. Use `react-native-safe-area-context` — not the built-in `SafeAreaView`, which is
iOS-only and effectively deprecated:

```tsx
const insets = useSafeAreaInsets()
<View style={{ paddingTop: insets.top }}>
```

Prefer `useSafeAreaInsets` over `<SafeAreaProvider>`'s `SafeAreaView` when you need the
background to run edge-to-edge under the status bar — which is what Nudj's portfolio
header does.

---

## 4. Navigation — expo-router · M0

expo-router is file-based routing built on top of React Navigation. The filesystem under
`app/` *is* the route tree.

```
app/
├── _layout.tsx              # root: providers, splash, auth gate
├── (auth)/
│   ├── _layout.tsx
│   └── sign-in.tsx          # /sign-in
└── (tabs)/
    ├── _layout.tsx          # the <Tabs> navigator
    ├── index.tsx            # /            → Home
    ├── spends.tsx           # /spends
    ├── subscriptions.tsx    # /subscriptions
    ├── portfolio.tsx        # /portfolio
    ├── assist.tsx           # /assist
    └── txn/[id].tsx         # /txn/123     → dynamic segment
```

Things to internalise:

- **`_layout.tsx` is persistent UI**, like a Next.js layout. A navigator lives here;
  providers live in the root one.
- **Parentheses are groups.** `(tabs)` organises files without adding a URL segment. This
  is how the auth stack and the tab stack coexist at the same URL depth.
- **`[id]` is a dynamic segment**, read with `useLocalSearchParams()`.
- **Every route is a URL**, which is what makes deep linking from a push notification
  almost free — M3 relies on this.
- Navigate with `<Link href="/txn/123">` or `router.push()`. Typed routes make both
  compile-time checked.

---

## 5. State — three kinds, three tools · M1

The most valuable architectural idea to take from this project: **"state" is not one
thing**, and using one tool for all of it is how RN apps become unmaintainable.

| Kind | Example in Nudj | Tool |
|---|---|---|
| **Server state** | transactions, subscriptions, holdings | TanStack Query |
| **Client/UI state** | selected month, filter sheet open, chart scrub position | Zustand, or `useState` |
| **Persisted secrets** | Supabase session tokens | expo-secure-store |

### Why `useEffect` fetching is the wrong default

```tsx
// ✗ The pattern to unlearn
const [txns, setTxns] = useState([])
useEffect(() => { fetch(url).then(r => r.json()).then(setTxns) }, [])
```

That snippet has no loading state, no error state, no retry, no cache, no deduplication of
concurrent callers, no refetch on reconnect, and no invalidation when a mutation changes
the data. On a mobile app that is backgrounded and resumed on flaky networks, every one of
those is a real bug.

```tsx
// ✓ What Nudj does
const { data, isPending, error } = useQuery({
  queryKey: ['transactions', { month, category }],
  queryFn: () => api.listTransactions({ month, category }),
})
```

The **query key is the cache identity**. Including `month` and `category` means switching
filters is an instant cache hit on the way back. Mutations then invalidate by key:

```tsx
const { mutate } = useMutation({
  mutationFn: api.recategorize,
  onMutate: async (next) => { /* optimistic write + snapshot for rollback */ },
  onError: (_e, _v, ctx) => { /* restore the snapshot */ },
  onSettled: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
})
```

### Why React Context is wrong for server data

Context has no caching, no staleness model, and — critically — **every consumer re-renders
when any part of the value changes.** A context holding all transactions re-renders every
subscriber when one category is corrected. Context is right for things that rarely change:
the theme, the auth session object, the query client itself.

---

## 6. Lists and performance · M2

### Virtualisation

`ScrollView` mounts every child. With 2,000 transaction rows that is 2,000 native view
trees and an unusable app. `FlatList` **virtualises**: it mounts a window of rows around
the viewport and unmounts the rest.

`FlashList` (Shopify) goes further and **recycles** — it reuses an existing row's native
views for new data instead of unmounting and remounting. That is why Nudj uses it for the
transaction list.

```tsx
<FlashList
  data={txns}
  keyExtractor={(t) => t.id}
  getItemType={(t) => (t.isHeader ? 'header' : 'row')}   // recycle like with like
  renderItem={({ item }) => <TxnRow txn={item} />}
  onEndReached={fetchNextPage}
/>
```

- **`keyExtractor` must return a stable id.** Using the array index means recycling
  reuses the wrong row's state — the classic "wrong amount flashes in the wrong row" bug.
- **`getItemType`** keeps recycling pools separate so a date header never gets recycled
  into a transaction row.

### Memoisation matters more here than on web

A re-render on web is a diff against the DOM. A re-render here can mean reconciling
against native views across a thread boundary, for every mounted row. So:

```tsx
const TxnRow = React.memo(({ txn }: { txn: Txn }) => { /* … */ })
```

`React.memo` only helps if the props are referentially stable, which means inline
callbacks and inline style objects defeat it:

```tsx
// ✗ New function identity every render → memo never hits
renderItem={({ item }) => <TxnRow txn={item} onPress={() => open(item.id)} />}

// ✓ Stable callback, row does the binding
const onPress = useCallback((id: string) => open(id), [open])
renderItem={({ item }) => <TxnRow txn={item} onPress={onPress} />}
```

---

## 7. Animation and gestures · M2, M4

### The core idea: worklets

Reanimated lets you mark a function as a **worklet** — JavaScript that is extracted and run
on the **UI thread**, not the JS thread. That is why a Reanimated animation stays at 60fps
even while the JS thread is busy parsing a statement.

```tsx
const x = useSharedValue(0)                        // lives on the UI thread
const style = useAnimatedStyle(() => ({            // a worklet
  transform: [{ translateX: x.value }],
}))
```

`useSharedValue` is the bridge-free channel between threads. The rule that follows: **a
worklet cannot call ordinary JS directly.** To get back to React, use `runOnJS`.

### Gestures

`react-native-gesture-handler` handles touch recognition natively, so a swipe is
recognised and animated without JS involvement. Nudj uses it for swipe-to-recategorise in
M2 and for chart scrubbing in M4.

### Charts — Skia

`@shopify/react-native-skia` exposes Skia (the same 2D engine Chrome and Flutter use) as
React components, drawing on a GPU canvas. Paired with Reanimated, a chart can follow your
thumb entirely on the UI thread.

`react-native-svg` is the alternative: simpler, declarative, good for static icons and
small sparklines, but every frame of an animation goes through the renderer. Rule of thumb
for Nudj: **Skia for anything interactive or redrawn per frame, SVG for static marks.**

---

## 8. Storage — four options, and what goes where · M1, M2

| Store | Encrypted | Size | Use in Nudj |
|---|---|---|---|
| `expo-secure-store` | Yes — iOS Keychain, Android Keystore | ~2KB per value | Supabase session tokens |
| `AsyncStorage` / MMKV | **No** | Large | Nothing sensitive. Last-selected month, onboarding flags |
| `expo-sqlite` | No (encryption optional) | Large | The offline transaction cache |
| `expo-file-system` | No | Files | Downloaded statement PDFs |

Two traps:

- **`AsyncStorage` is plaintext on disk.** An auth token there is readable on a rooted or
  jailbroken device. Secrets go in SecureStore, always.
- **SecureStore has a small per-value size limit** (around 2KB). A Supabase session with
  a large JWT can exceed it, which fails *silently* on some platforms. If it does, split
  the session across keys or store only the refresh token.

### SQLite + Drizzle for offline reads

M2 adds a read-through cache: the API response is written to SQLite, and the UI reads
SQLite so the app works fully offline. Drizzle gives typed queries and, importantly,
**migrations** — the schema in an installed app is whatever version the user last opened,
so every change needs a forward migration. This is the part of offline-first that people
underestimate.

---

## 9. Formatting rupees — the Hermes `Intl` caveat · M4

Nudj is a rupee app, so Indian digit grouping (`₹12,34,567`, not `₹1,234,567`) is not
cosmetic.

```ts
const inr = (n: number) =>
  n.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
```

The caveat: **Hermes's `Intl` support is not the same as a browser's.** Depending on the
RN version and platform, full ICU data may not be bundled, and `toLocaleString` can
silently fall back to en-US grouping — which produces a *plausible but wrong* number, the
worst kind of bug in a finance app.

**Verified in M0 on 2026-10-13: both platforms report `native`.** iOS Simulator (iOS 26.5) and
a physical Android phone both format `en-IN` correctly, so Hermes ships usable ICU data on
current SDK 57 builds.

The hand-written fallback in `src/lib/money.ts` **stays anyway**. It costs nothing, it is
unit-tested, and it protects against a device or OS build with trimmed ICU data — which is
exactly the kind of thing you discover from a user, not from your own two devices. The smoke
card's `Intl grouping: native | fallback` line stays in the app through M1 so the answer keeps
being visible rather than assumed.

Also: use `fontVariant: ['tabular-nums']` wherever amounts stack in a column, so the digits
line up.

---

## 10. Notifications · M3

```
Nudj backend → Expo Push Service → APNs (iOS) / FCM (Android) → device
```

- **Permission is not a boolean.** It is `undetermined` → `granted`/`denied`, iOS asks once,
  and a denial is only reversible in system settings. So ask in context, after the user has
  seen why — not on first launch.
- **Android requires channels.** Every notification belongs to a channel, and the *user*
  controls importance per channel. Nudj will have at least two: "Payment alerts" (high) and
  "Digests" (default), so someone can mute the weekly summary without losing pre-debit
  warnings.
- **Push tokens rotate.** On reinstall, restore, or OS whim. Re-register on every launch and
  upsert into `devices`.
- **Server-driven push beats background tasks.** `expo-background-task` runs at the OS's
  discretion — iOS may defer it for hours and Android OEMs kill it aggressively. Anything
  that *must* arrive on time is scheduled server-side by `scheduler.ts`. This is why
  Nudj's cron jobs live on the backend and not on the phone.
- **Delivery is not guaranteed.** Chinese Android OEM battery optimisation silently drops
  FCM. That is the entire reason the WhatsApp channel stays as a fallback.

---

## 11. Streaming responses — a real RN gotcha · M5

The assistant streams tokens, which on web is three lines of `fetch` + `ReadableStream`.
In React Native, **the global `fetch` is a polyfill over `XMLHttpRequest` and does not
support response body streaming.** `res.body` is not a readable stream, so the naive
approach gives you the whole response at once, after the wait.

Options, in order of preference:

1. **`expo/fetch`** — a WinterCG-compliant fetch with real streaming support. The clean path.
2. **XHR `onprogress`** — read `xhr.responseText` as it grows and diff it yourself. Ugly,
   works everywhere.
3. **Polling** — not streaming; a last resort.

Worth meeting this one deliberately, because it is a good lesson in "React Native is not a
browser" showing up somewhere you did not expect.

---

## 12. Environment and secrets · M1, M6

**Nothing in the app bundle is secret.** Anyone can unzip an IPA or APK and read the JS.

```ts
process.env.EXPO_PUBLIC_API_URL   // ✓ inlined at build time, public by design
process.env.OPENROUTER_API_KEY    // ✗ never. This belongs on the server.
```

- Only `EXPO_PUBLIC_`-prefixed variables reach the app, and the prefix is a **warning
  label**, not a protection.
- Build-time secrets (signing keys, service accounts) go in **EAS secrets**, used during
  the build and never shipped.
- This is a second reason the app talks to Hono rather than to Gemini or Supabase
  directly: every real key stays server-side.

### OTA updates

`expo-updates` can ship a new JS bundle without an app-store review. It **cannot** change
native code — a new native module, a permission, an icon, an app-config change — which
still needs a store build. Knowing which of your changes is which saves a lot of confusion
in M6.

---

## 13. Testing · M7

| Layer | Tool | Target in Nudj |
|---|---|---|
| Unit | Jest | CAS parser, XIRR, the compliance firewall, date projection |
| Component | React Native Testing Library | Critical screens, rendered and interacted with |
| E2E | Maestro | Six real flows on a real simulator |

RNTL's principle is to query the way a user perceives the UI — by accessible label and
text, not by component internals:

```tsx
const { getByText } = render(<TxnRow txn={fixture} />)
fireEvent.press(getByText('Swiggy'))
```

Which means **good accessibility labels and good tests are the same work.** Native modules
have no JS implementation under Jest, so each one needs a mock — expect to maintain a
`jest.setup.ts` that mocks SecureStore, notifications and SQLite.

---

## 14. OAuth in a native app · M1

Google sign-in on mobile is not the web redirect flow, and the difference is worth understanding
because Nudj's sign-in depends on it.

There is no page to redirect back to. The app opens a **system browser** — `expo-web-browser` /
`expo-auth-session`, which uses `SFAuthenticationSession` on iOS and Custom Tabs on Android — and
Google returns the user to the app through a **deep link** registered to the app's scheme. Three
consequences:

- **Never use a plain `WebView` for OAuth.** Google blocks it, and rightly: an in-app WebView
  lets the host app read what the user types, so it defeats the point of the consent screen.
- **The redirect URI must be registered in three places** that have to agree: the Google Cloud
  OAuth client, `app.config.ts` (`scheme`), and the `expo-auth-session` request. A mismatch fails
  with an unhelpful error.
- **PKCE, not a client secret.** The app bundle is public (§12), so there is no secret to keep.
  The flow uses a code challenge instead, and the code is exchanged **server-side** — the token
  exchange and the encrypted token storage already exist in `oauth.ts`, so the app hands the
  backend a code and never holds Gmail tokens itself.

The session that comes back is what goes in `expo-secure-store` (§8) — and that is also where the
~2 KB value limit bites, since a Google ID token plus a Supabase session is not small.

---

## Appendix — concepts by milestone

| Milestone | Introduces |
|---|---|
| M0 | Runtime (§1), core components (§2), styling (§3), navigation (§4) |
| M1 | State (§5), secure storage (§8), env/secrets (§12), `AppState` lifecycle, OAuth in a native app (§14) |
| M2 | Lists & perf (§6), animation & gestures (§7), SQLite (§8), file picker & upload |
| M3 | Notifications (§10), deep linking |
| M4 | Skia charts (§7), currency formatting (§9), chart accessibility |
| M5 | Streaming (§11), inverted lists, keyboard handling, error boundaries |
| M6 | OTA updates (§12), dynamic type, source maps |
| M7 | Testing (§13), EAS build profiles, store review |
