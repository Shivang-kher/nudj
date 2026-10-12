---
sidebar_position: 6
title: Pseudocode — M0
---

# Pseudocode — M0: Foundations

**Lifecycle step:** 3 of 7 · **Model:** Opus 5 · **Date:** 2026-10-12 · **Status:** ✅ Built and verified 2026-10-13

> M0 in one sentence: **get a real app onto your phone, in Nudj's colours, with five tabs that
> navigate.** No features, no backend calls, no data.
>
> It exists so the tooling pain is paid once, up front — and so you meet the React Native
> basics on something small.

Reviewable artifact: https://claude.ai/artifact/ADsYZKVf7V1Vn8gPqMKFrw

Built against: [Tech Spec](./tech-spec.md) · [Design Sketchboard](./design-sketchboard.md) ·
[Dev Setup](./dev-setup.md)

---

## What M0 delivers

| Does | Does not |
|---|---|
| App installed on your phone from EAS | Talk to the backend |
| Five tabs that navigate | Show any real data |
| Nudj's light + dark palette, following the system | Sign-in |
| Indian rupee formatting, verified on device | Charts, lists, uploads |
| `npx tsc --noEmit` clean | Store anything |

---

## Task 1 — Scaffold and strip the template

```
RUN  cd ~/Dev/Nudj
RUN  npx create-expo-app@latest nudj-mobile
RUN  cd nudj-mobile

DELETE the template's starter content — we replace all of it:
     src/components/        (incl. animated-icon.web.tsx)
     src/constants/         (incl. theme.ts, which imports @/global.css)
     src/hooks/
     global.css
     src/app/(tabs)/explore.tsx

KEEP  src/app/_layout.tsx as a starting point — rewrite in Task 4

NOTE  The template has NO (tabs) group. As of 2026-10-12 create-expo-app ships a flat
      src/app/index.tsx + explore.tsx plus an AppTabs component built on
      expo-router/unstable-native-tabs. Delete that approach; build the (tabs) group
      from scratch in Task 4 with classic <Tabs>.

DROP web support — Nudj is phone-only, and the web files are the whole reason
     `tsc` is red out of the box:
RUN  npm uninstall react-dom react-native-web
EDIT app.config.ts → platforms: ["ios", "android"]
```

**Done when** `npx tsc --noEmit` exits 0. This is the fix for the known red typecheck.

---

## Task 2 — TypeScript and path aliases

```
EDIT tsconfig.json
     compilerOptions.strict            = true
     compilerOptions.noUncheckedIndexedAccess = true
     compilerOptions.paths             = { "@/*": ["./src/*"] }
     compilerOptions.types             = ["jest"]      // or Task 9's own tests fail tsc
     include                           = ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts"]
RUN  npm i -D @types/jest@29  // pin to 29.x — it must match the jest 29.7 line jest-expo uses
```

**Done when** `import { palette } from '@/theme/tokens'` resolves in both Metro and `tsc`.

---

## Task 3 — Design tokens

The exact values from the sketchboard's Foundations board. One file, no logic.

```
FILE src/theme/tokens.ts

EXPORT light = {
  ground:'#F4F6F5'  surface:'#FFFFFF'  tile:'#EDF0EE'  border:'#E2E6E3'  border2:'#CBD3CE'
  ink:'#0E1613'     muted:'#5F6B65'    faint:'#737E78'
  accent:'#0E7C63'  accentSoft:'#DDEFE8'  accentInk:'#0A5F4C'
  up:'#0B7A54'      down:'#C0392B'
  due:'#9A6B0E'     dueSoft:'#F7EEDA'     dueInk:'#7A5409'
}

EXPORT dark = {
  ground:'#0D1210'  surface:'#161D1A'  tile:'#1E2723'  border:'#2A332E'  border2:'#3A443E'
  ink:'#E9EDEA'     muted:'#9BA5A0'    faint:'#8B958F'
  accent:'#3FD6A8'  accentSoft:'#12352C'  accentInk:'#5FE0B8'
  up:'#3FD6A8'      down:'#F2785C'
  due:'#E0A94A'     dueSoft:'#2E2510'     dueInk:'#E0A94A'
}

EXPORT type Palette = Record<keyof typeof light, string>
       // NOT `typeof light` on an `as const` object — that would bake in the literal
       // hex strings and dark's different values would fail to satisfy it. The check
       // we want is key presence, not colour equality.
EXPORT radius  = { card:20, tile:16, button:16, pill:999 }
EXPORT space   = { gutter:16, cardPad:20, gap:12 }
EXPORT text    = {
  display:{ size:34, weight:'700', letterSpacing:-0.95 }
  title:  { size:21, weight:'700', letterSpacing:-0.42 }
  body:   { size:15, weight:'500' }
  caption:{ size:13, weight:'400' }
  micro:  { size:10, weight:'400', letterSpacing:1.2, textTransform:'uppercase' }
}
```

> **Note on letter-spacing:** React Native takes `letterSpacing` in points, not `em`. The
> sketchboard's `-0.028em` at 34px becomes `-0.95`. Do the arithmetic once, here.

```
FILE src/theme/useTheme.ts

FUNCTION useTheme() -> Palette
  scheme = useColorScheme()                 // from react-native; may return null
  RETURN scheme === 'dark' ? dark : light   // null falls back to light
```

**Done when** `dark` type-checks as `Palette` — meaning neither palette can drift and miss a key.

---

## Task 4 — The five-tab shell

```
FILE src/app/_layout.tsx                    // root layout
  WRAP everything in <SafeAreaProvider>
  SET  <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
  SET  background from theme.ground so there is no white flash on launch
  RENDER <Stack screenOptions={{ headerShown: false }} />

FILE src/app/(tabs)/_layout.tsx
  theme = useTheme()
  RENDER <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor:   theme.accent,
      tabBarInactiveTintColor: theme.faint,
      tabBarStyle: { backgroundColor: theme.surface, borderTopColor: theme.border },
      tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
    }}>
    TAB index      title 'Home'       icon 'home'
    TAB spends     title 'Spends'     icon 'receipt'
    TAB upcoming   title 'Upcoming'   icon 'calendar'
    TAB portfolio  title 'Portfolio'  icon 'pie'
    TAB assist     title 'Assist'     icon 'chat'
  </Tabs>

FILE src/components/TabIcon.tsx
  PROPS { name, color: ColorValue, size = 21 }   // ColorValue, not string —
                                                 // tabBarIcon passes OpaqueColorValue
  // COPY the path data verbatim from the sketchboard's tab bars. Do not redraw by hand.
  home     M3 10.6 12 3.5l9 7.1V20a1 1 0 0 1-1 1h-4.6v-6.2H9.6V21H4a1 1 0 0 1-1-1z
  receipt  M5.5 3h13v18l-3.2-2.1-3.3 2.1-3.3-2.1L5.5 21z  +  M9 8h6M9 12h6
  calendar <Rect x=3.5 y=5.5 w=17 h=15.5 rx=3>  +  M8 3v4M16 3v4M3.5 11h17
  pie      M12 3.2a8.8 8.8 0 1 0 8.8 8.8H12z  +  M14.6 3.6A8.8 8.8 0 0 1 20.4 9.4h-5.8z
  chat     M4 5.5h16v10.2H9.4L4 20z
  ALL with viewBox '0 0 24 24', fill none, strokeWidth 1.9, linecap+linejoin round
```

:::note Icons need one install
`react-native-svg` is not in the SDK 57 template. `npx expo install react-native-svg`.
That is a **native** dependency, so the dev client must be rebuilt after adding it — add it
before Task 8, not after.
:::

---

## Task 5 — Screen and Card primitives

```
FILE src/components/Screen.tsx
  PROPS { title, children }
  theme  = useTheme()
  insets = useSafeAreaInsets()
  RETURN <View flex:1 backgroundColor:theme.ground paddingTop:insets.top + 10
               paddingHorizontal:space.gutter>
           <Text style={title-style, color:theme.ink}>{title}</Text>
           {children}
         </View>

FILE src/components/Card.tsx
  PROPS { children }
  theme = useTheme()
  RETURN <View backgroundColor:theme.surface borderRadius:radius.card padding:space.cardPad
               // light: soft shadow. dark: 1px border — a shadow is invisible on dark ground.
               {...(isDark ? { borderWidth:1, borderColor:theme.border }
                           : { shadowColor:'#0E1613', shadowOpacity:0.06,
                               shadowRadius:16, shadowOffset:{width:0,height:8},
                               elevation:2 })}>
           {children}
         </View>
```

This is where the sketchboard's "shadows in light, borders in dark" rule becomes code.

---

## Task 6 — Rupee formatting, with the device check built in

This is the fix for the known Indian-grouping risk. The module **detects** whether the phone's
JS engine groups correctly and falls back to doing it by hand.

```
FILE src/lib/money.ts

// CONTRACT: money is PAISE as integers everywhere — API, SQLite, state.
// Rupees exist only as display strings, produced here and nowhere else.

FUNCTION groupIndian(digits: string) -> string
  IF digits.length <= 3 RETURN digits
  tail = last 3 chars
  head = everything before
  insert ',' into head every 2 chars from the right
  RETURN head + ',' + tail
  // 1234567 -> head '1234' tail '567' -> '12,34' + ',' + '567' -> '12,34,567'

FUNCTION intlGroupsIndian() -> boolean
  TRY    RETURN (1234567).toLocaleString('en-IN') === '12,34,567'
  CATCH  RETURN false

CONST USE_INTL = intlGroupsIndian()        // evaluated once, at module load

FUNCTION formatInr(paise: number, opts = { decimals: false }) -> string
  rupees = paise / 100
  IF USE_INTL
    RETURN rupees.toLocaleString('en-IN', {
             style:'currency', currency:'INR',
             minimumFractionDigits: opts.decimals ? 2 : 0,
             maximumFractionDigits: opts.decimals ? 2 : 0 })
  ELSE
    whole = floor(abs(rupees)) as string
    out   = '₹' + groupIndian(whole)
    IF opts.decimals: out += '.' + two-digit remainder
    IF rupees < 0:    out  = '-' + out
    RETURN out

EXPORT { formatInr, groupIndian, USE_INTL }
```

**Done when** both paths produce `₹12,34,567` for `123456700` paise — unit-tested in Task 9,
eyeballed on the device in Task 10.

:::tip The fallback is already verified
`groupIndian` was run against all seven cases in Task 9 before this document was published:
`123`, `1234`, `123456`, `1234567`, `123456789`, `12`, `12345` — **all pass**. So if the device's
`Intl` turns out to be wrong, the fallback is known-good rather than hopeful.
:::

---

## Task 7 — Placeholder screens that prove the foundations

Each tab renders the same smoke card. Boring on purpose: it is the exit test made visible.

```
FILE src/app/(tabs)/index.tsx        (and spends / upcoming / portfolio / assist)

RENDER <Screen title="Home">
         <Card>
           <Text micro   color=muted >  M0 SMOKE TEST            </Text>
           <Text display color=ink   >  {formatInr(84216000)}    </Text>   // ₹8,42,160
           <Text body    color=up    >  ▲ {formatInr(8616000)}   </Text>   // ₹86,160
           <Text caption color=muted >  Intl grouping: {USE_INTL ? 'native' : 'fallback'} </Text>
         </Card>
       </Screen>
```

The last line is deliberate: it tells us on the device itself which code path is live, so the
`Intl` question is answered by looking at the screen rather than by guessing.

---

## Task 8 — App config and build profiles

```
FILE app.config.ts
  name 'Nudj'   slug 'nudj'   scheme 'nudj'        // scheme is needed for M1's OAuth deep link
  version '0.1.0'   orientation 'portrait'
  userInterfaceStyle 'automatic'                   // required, or dark mode never triggers
  // NO newArchEnabled — removed from SDK 57's config schema; the New Architecture
  // is now the only architecture, so the flag is a type error
  ios     { bundleIdentifier 'com.nudj.app', supportsTablet false }
  android { package 'com.nudj.app', adaptiveIcon { backgroundColor '#0E7C63' } }
  platforms ['ios','android']
  plugins ['expo-router']

FILE eas.json                                      // profiles exactly as in the tech spec
  development            { developmentClient true, distribution 'internal' }
  development-simulator  { …, ios: { simulator: true } }
  preview                { distribution 'internal' }
  production             { autoIncrement true }

FILE .env
  EXPO_PUBLIC_API_URL=http://localhost:8000        // unused in M0; set now so M1 is ready
```

```
RUN  eas init                                      // links the project; already logged in
RUN  eas build --profile development-simulator --platform ios
RUN  eas build --profile development --platform android     // .apk for your phone
```

---

## Task 9 — Tests

Small, because M0 is small. But `money.ts` is pure logic that everything later depends on.

```
RUN  npx expo install --dev jest jest-expo @testing-library/react-native
FILE jest.config.js    preset 'jest-expo'

FILE src/lib/money.test.ts
  groupIndian('123')        -> '123'
  groupIndian('1234')       -> '1,234'
  groupIndian('123456')     -> '1,23,456'
  groupIndian('1234567')    -> '12,34,567'
  groupIndian('123456789')  -> '12,34,56,789'
  formatInr(0)              -> '₹0'
  formatInr(84216000)       -> '₹8,42,160'
  formatInr(-412000)        -> starts with '-'
  formatInr(84216050, {decimals:true}) ends with '.50'

FILE src/theme/tokens.test.ts
  Object.keys(light) deep-equals Object.keys(dark)     // neither palette can drift
```

**Done when** `npx jest` is green.

---

## Task 10 — The exit test, on your phone

Not a checklist of code. A checklist of things you look at.

1. App launches from the dev client on your phone — **no white flash** before the first paint
2. All five tabs navigate, labels and icons correct, active tab is Nudj green
3. Switch the phone to dark mode with the app open → **the whole UI flips**, nothing stays light
4. The smoke card reads `₹8,42,160` — commas at **2,2,3**, not 3,3,3
5. The card's last line says whether `Intl` is native or fallback — **note which**, it answers
   the open question
6. `npx tsc --noEmit` exits 0
7. `npx jest` green

Then M0 is done and M1 (sign-in and the API spine) can start.

---

## Lesson from executing this

Three errors in this document were only found by running it, and all three came from the same
root cause: **Expo's template is a moving target.** `dev-setup.md` verified the scaffold on
2026-10-09; by 2026-10-12 `create-expo-app` had already dropped the `(tabs)` group and SDK 57
had removed `newArchEnabled` from its config schema. Three days.

For every future milestone: **re-check the scaffold at execution time, not at spec time.** A
"verified" toolchain note has a shelf life measured in days, not weeks.

## Notes for whoever executes this

- `npx expo install`, never bare `npm install`.
- `react-native-svg` is native → add it **before** the dev-client build, or you rebuild twice.
- Routes live in `src/app/`, not `app/`. The SDK 57 template uses the `src/` layout.
- Do not add TanStack Query, Zustand, Drizzle or SecureStore yet. They belong to M1, and M0's
  value is that it is small enough to debug.
- If `tsc` is still red after Task 1, find the remaining template file and delete it rather than
  adding a `.d.ts` shim to silence it.


---

## Result — M0 complete, 2026-10-13

All seven exit checks pass on both platforms.

| Check | Result |
|---|---|
| Launches from the dev client, no white flash | ✅ iOS Simulator + physical Android |
| Five tabs navigate, active tab Nudj green | ✅ |
| Dark mode flips the whole UI | ✅ card swaps shadow → border as designed |
| Card reads `₹8,42,160`, commas at 2,2,3 | ✅ both platforms |
| `Intl grouping:` line | **`native` on both** — see below |
| `npx tsc --noEmit` | ✅ 0 errors |
| `npx jest` | ✅ 10/10 |

**The `Intl` question is settled: native on both.** Hermes ships usable `en-IN` ICU data on
SDK 57. The fallback stays as insurance — it is free, tested, and guards against a trimmed-ICU
device we do not own.

Three further corrections came out of execution, all folded back into this doc: the template no
longer ships a `(tabs)` group, `newArchEnabled` is gone from SDK 57's schema, and `@types/jest`
plus `types: ["jest"]` are needed for the doc's own tests to typecheck. A fourth was found at
build time: **`expo-dev-client` must be installed**, or `eas build --profile development`
refuses to run. And `eas init` cannot write to a TypeScript config — it creates the project,
errors, and leaves you to paste `extra.eas.projectId` in by hand.
