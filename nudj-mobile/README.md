# nudj-mobile

The Nudj React Native app. Expo SDK 57, expo-router, TypeScript strict.

Docs live in the wiki, not here:

- [Implementation plan](../wiki/docs/mobile/implementation-plan.md) — milestones M0–M7
- [Tech spec](../wiki/docs/mobile/tech-spec.md) — schema, API, module contracts
- [Dev setup](../wiki/docs/mobile/dev-setup.md) — toolchain, device choice, the live-reload loop
- [React Native concepts](../wiki/docs/react-native-concepts.md) — the concepts this app uses, explained
- [Design sketchboard](../wiki/docs/mobile/design-sketchboard.md) — screens and tokens

## Run it

```bash
npx expo start --dev-client     # or: make mobile  (from the repo root)
```

Needs the custom dev client installed, not Expo Go — this app uses native modules
(react-native-svg now; Skia and FlashList later) that Expo Go does not bundle.

```bash
eas build --profile development-simulator --platform ios   # iOS Simulator
eas build --profile development --platform android         # .apk for a real phone
```

## Checks

```bash
npx tsc --noEmit    # must be 0 errors
npx jest            # unit tests
```

## Conventions

- **Money is paise, as integers**, everywhere — API, state, storage. Rupees exist only as
  display strings, produced by `formatInr()` in `src/lib/money.ts` and nowhere else.
- Routes live in `src/app/`, not `app/`.
- Always `npx expo install`, never bare `npm install`, for Expo/RN packages.
- Colours come from `src/theme/tokens.ts`. There is no cascade in React Native, so every
  component reads the theme itself via `useTheme()`.
