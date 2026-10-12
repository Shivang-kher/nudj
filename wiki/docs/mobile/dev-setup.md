---
sidebar_position: 3
title: Dev Setup & Live Reload
---

# Dev Setup & Live Reload

> Everything needed to run the Nudj app on a device, see changes live, and test it.
>
> **Every claim below was verified on this machine on 2026-10-09**, by scaffolding a throwaway
> Expo app, installing the real dependency set, and compiling it for both platforms. Where
> something behaved differently from the documentation, the actual behaviour is what's written
> here.

---

## 0. Verified state of this machine

| Component | State | Verified how |
|---|---|---|
| Node | **25.9.0** — works | `expo-doctor` 21/21 passed; Metro bundled to Hermes bytecode |
| npm | 11.12.1 | — |
| Xcode | **27.0** (build 27A266a) | `xcodebuild … BUILD SUCCEEDED`, `probe.app` produced |
| iOS runtimes | 26.5 and 27.0, 12 simulators | `xcrun simctl list` |
| CocoaPods | 1.17.0 | `pod install` resolved the full RN 0.86 pod graph |
| EAS CLI | **24.12.1** — installed | `eas --version` |
| Watchman | **2026.10.05.00** — installed | `watchman --version` |
| JDK | **OpenJDK 17.0.20.1** — installed | `java -version` in a fresh login shell |
| Android SDK | **installed** at `/opt/homebrew/share/android-commandlinetools` | `adb version` → 1.0.41 |
| Android build | **`BUILD SUCCESSFUL`** in 10m 4s, 505 tasks | `./gradlew assembleDebug` → `app-debug.apk` |
| Emulator boot | **booted in ~25s**, Android 16 (API 36) | `adb shell getprop sys.boot_completed` → 1 |
| APK install | **`Success`** | `adb install` → `package:com.anonymous.probe` |
| Android Studio | **2026.2.1.8** — installed | `/Applications/Android Studio.app` |
| Emulator AVD | **`Nudj_Pixel_API36`** (API 36, arm64, 1080×2400 @420dpi) | `emulator -list-avds` |
| Homebrew | 7.0.6 | — |
| Disk free | 308 GB | — |
| Backend | boots, `/health` → `{"status":"ok"}`, all 12 env keys set | `npm start` + curl |
| Backend typecheck | clean | `npm run typecheck` |

**Still to do, by you:** `eas login` — it's interactive, so run `! eas login` in this session or
`eas login` in a terminal. Nothing else is outstanding.

### What the versions actually are

Scaffolding with `create-expo-app@latest` today pins:

```
expo                          ~57.0.27
react-native                  0.86.3
react                         19.2.3
expo-router                   (in template)
react-native-reanimated       4.5.1
react-native-worklets         0.10.1
react-native-gesture-handler  ~2.32.0
expo-secure-store             ~57.0.4
expo-sqlite                   ~57.0.4
expo-local-authentication     ~57.0.3
expo-notifications            ~57.0.22
expo-document-picker          ~57.0.3
@shopify/flash-list           2.0.2
@shopify/react-native-skia    2.6.2
```

All of it resolved cleanly, `expo-doctor` reported 21/21 checks passing with the natives added,
and a bundle importing Skia + FlashList + every native module grew from 3.5 MB to 4.4 MB —
confirming they are genuinely compiled in, not silently dropped.

Both platforms were then compiled for real, not just bundled. The Android APK carries 26 native
libraries across all four ABIs, including the ones that matter:

```
librnskia.so            18.1 MB
libreanimated.so         8.3 MB
libworklets.so           4.6 MB
libhermesvm.so           3.7 MB
libexpo-sqlite.so        1.8 MB
libexpo-modules-core.so  1.7 MB
```

The debug APK is 293 MB because a debug build ships all four ABIs uncompressed; production
builds split per-ABI and are a fraction of that.

:::note Node 25 is fine
Node 25 is an odd-numbered, non-LTS release, which would normally be a concern for a 12-week
project. It was tested rather than assumed: `expo-doctor` raises no version complaint, Metro
bundles, and Hermes produces bytecode. **No Node change is needed.** If anything odd surfaces
later, `brew install node@24` is the fallback.
:::

---

## 1. Toolchain, and the two install gotchas

| Tool | Install |
|---|---|
| EAS CLI | `npm i -g eas-cli` then `eas login` |
| Watchman | `brew install watchman` |
| Xcode | Mac App Store, then `xcode-select --install` |
| JDK 17 | `brew install openjdk@17` — **not the Temurin cask** |
| Android SDK | `brew install --cask android-commandlinetools` |
| Android Studio | `brew install --cask android-studio` |
| Maestro | `curl -Ls "https://get.maestro.mobile.dev" \| bash` — not needed until M7 |

**Gotcha 1 — don't use the Temurin cask.** `brew install --cask temurin@17` installs a `.pkg`
to `/` and **requires sudo**, which fails in any non-interactive context. `brew install
openjdk@17` installs into the Homebrew prefix with no sudo. It is keg-only, so `JAVA_HOME` must
point at it explicitly — which §2 does.

**Gotcha 2 — the Gradle wrapper download times out.** See §6.

## 2. Shell environment

Appended to `~/.zshrc` (a backup was saved as `~/.zshrc.bak-nudj-20261009`):

```bash
# >>> nudj android/java toolchain (added for React Native development) >>>
export JAVA_HOME="/opt/homebrew/opt/openjdk@17"
export ANDROID_HOME="/opt/homebrew/share/android-commandlinetools"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
# <<< nudj android/java toolchain <<<
```

Verified in a fresh login shell: `JAVA_HOME`, `ANDROID_HOME`, `java -version`, `adb version`
and `emulator -list-avds` all resolve. To undo, delete the block between the markers.

### Android SDK packages installed

```bash
sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0" \
           "emulator" "system-images;android-36;google_apis;arm64-v8a"
```

Expo SDK 57 sets these through its `expo-root-project` Gradle plugin rather than literal values
in `build.gradle`, so they aren't greppable from the generated project. The build itself prints
them, and they are:

```
minSdk      24
compileSdk  36
targetSdk   36
ndk         27.1.12297006
kotlin      2.1.20
ksp         2.1.20-2.0.1
gradle      9.3.1
```

**The NDK does not need installing by hand** — Gradle fetched `27.1.12297006` itself once the
SDK licences were accepted. Skia and Reanimated both need it, so this matters.

### The emulator

```bash
avdmanager create avd -n Nudj_Pixel_API36 \
  -k "system-images;android-36;google_apis;arm64-v8a" -d pixel_7
```

This prints `Error: Could not load devices from … devices.xml`. **That error is harmless** — the
command-line tools ship without the device-profile catalogue, so `-d pixel_7` is ignored, but
the AVD is still created with sensible Pixel-class defaults (1080×2400 at 420 dpi, 2 GB RAM).
The data partition was raised to 6 GB afterwards.

To run it headless (useful for CI and for a quick install check without a window):

```bash
emulator -avd Nudj_Pixel_API36 -no-window -no-audio -no-boot-anim \
  -gpu swiftshader_indirect -no-snapshot-save &
adb wait-for-device
# then poll: adb shell getprop sys.boot_completed  → 1
adb emu kill   # shut it down
```

Verified: boots in ~25 s, reports Android 16, and `adb install` of the debug APK returns
`Success`.

One warning appears during SDK operations and can be ignored: *"This version only understands
SDK XML versions up to 3 but an SDK XML file of version 4 was encountered."* It means the
command-line tools are older than the repository format. Nothing failed because of it.

## 3. Which device to develop on

| Target | Cost | Good for | Cannot do |
|---|---|---|---|
| **iOS Simulator** | free | All UI work. Fastest loop by far. | Real push via APNs, real biometrics, real perf |
| **Android emulator** | free | Android layout, FCM basics | OEM battery-optimisation behaviour |
| **Your physical Android** | free | Push, biometrics, true perf, and the battery-optimisation reality that kills FCM | iOS-specific bugs |
| **Physical iPhone** | $99/yr Apple Developer Program | Final iOS verification, TestFlight | — |

**Day-to-day: iOS Simulator.** Fastest loop, and the full native build is already proven here.
**At M3, switch to your physical Android** for push and biometrics — EAS produces an `.apk` you
download straight onto the phone, no `adb` needed. The emulator is the fallback when the phone
isn't to hand.

Buy the Apple Developer membership at **M7**, when TestFlight is actually needed. You *can*
sideload to your own iPhone from Xcode with a free Apple ID, but the certificate expires every
7 days — fine for a one-off look, not a daily loop.

## 4. Expo Go vs the dev client

Expo Go ships a fixed set of native modules. Nudj needs `@shopify/react-native-skia` (charts)
and `@shopify/flash-list` (the transaction list), and **neither is in Expo Go**. So from M0 we
build a **custom dev client** once, install it, and from then on every JS change is instant.

Note what the SDK 57 template already includes, so M0 doesn't reinstall them:
`react-native-gesture-handler`, `react-native-reanimated`, `react-native-worklets`,
`react-native-safe-area-context`, `react-native-screens`, `expo-router`, `expo-image`,
`expo-font`, `expo-constants`, `expo-device`, `expo-linking`, `expo-splash-screen`.

## 5. Scaffolding (M0)

```bash
cd ~/Dev/Nudj
npx create-expo-app@latest nudj-mobile
cd nudj-mobile

npx expo install expo-secure-store expo-sqlite expo-local-authentication \
  expo-notifications expo-document-picker \
  @shopify/flash-list @shopify/react-native-skia
```

Always `npx expo install`, never plain `npm install` — it picks the versions matched to the
pinned SDK.

:::warning Two things the stock template gets wrong for us
**Routes live in `src/app/`, not `app/`.** The SDK 57 default template uses a `src/` layout. Any
tutorial telling you to create `app/_layout.tsx` is writing to the wrong place and expo-router
will silently ignore it.

**`npx tsc --noEmit` fails out of the box** with two errors — `animated-icon.module.css` and
`@/global.css` have no type declarations. These come from the template's **web** support, which
Nudj does not target. Fix in M0 by deleting the web-only files or adding a `global.d.ts`
declaring the CSS module imports. Do it immediately, because a typecheck that is already red is
a typecheck nobody reads.
:::

### `eas.json`

```json
{
  "cli": { "version": ">= 24.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "development-simulator": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": { "simulator": true }
    },
    "preview": { "distribution": "internal" },
    "production": { "autoIncrement": true }
  }
}
```

```bash
# iOS Simulator
eas build --profile development-simulator --platform ios

# Physical Android — produces an .apk you install directly
eas build --profile development --platform android
```

## 6. The Gradle wrapper workaround

The first Android build fails like this:

```
Exception in thread "main" java.io.IOException: Downloading from
https://services.gradle.org/distributions/gradle-9.3.1-bin.zip failed: timeout (10000ms)
```

`services.gradle.org` answers with a **307 redirect to GitHub releases**, and the Gradle
wrapper's own HTTP client gives up on it after 10 seconds. The toolchain is fine; only the
download is. Seed the cache with curl, which follows the redirect happily:

```bash
# the hash directory is created by the first failed attempt
D=~/.gradle/wrapper/dists/gradle-9.3.1-bin/*/
curl -sSL -o "$D/gradle-9.3.1-bin.zip" \
  https://services.gradle.org/distributions/gradle-9.3.1-bin.zip
```

Then rerun the build. Already done on this machine (131 MB, verified intact).

## 7. The daily loop

```bash
cd nudj-mobile
npx expo start --dev-client
```

| Key | Does |
|---|---|
| `i` | open iOS Simulator |
| `a` | open Android emulator |
| QR code | open on a physical device running the dev client |
| `r` | full reload |
| `j` | open **React Native DevTools** — console, network, element inspector, profiler |
| `Cmd+D` / `Cmd+M` / shake | dev menu on iOS sim / Android emu / device |

**Fast Refresh** is what you actually live in: save a file and the screen updates in under a
second, **with component state preserved**. A syntax error shows a red screen and recovers on
the next save.

**You only rebuild the dev client when native code changes** — adding or removing a native
dependency, or editing `app.config.ts` in a way that touches the native project. JS and TS
changes never need a rebuild. Confusing these two is the single biggest source of wasted time
for people new to Expo.

## 8. Reaching the backend

`localhost:8000` means something different on every target:

| App running on | `EXPO_PUBLIC_API_URL` |
|---|---|
| iOS Simulator | `http://localhost:8000` |
| Android emulator | `http://10.0.2.2:8000` |
| Physical phone, same Wi-Fi | `http://<your-mac-lan-ip>:8000` — `ipconfig getifaddr en0` |
| Physical phone, different network | your ngrok / cloudflared tunnel (https) |

```bash
# nudj-mobile/.env
EXPO_PUBLIC_API_URL=http://localhost:8000
```

Plain HTTP to a LAN IP can be refused on iOS by App Transport Security. Expo dev builds permit
local networking, but if a LAN IP is blocked, use the https tunnel rather than fighting
`Info.plist`. `npx expo start --tunnel` routes Metro through ngrok when the phone can't reach
your Mac at all.

You already run a tunnel for the WhatsApp webhook. Pointing the app at that same https URL is
the simplest setup that works everywhere, and it means one backend serves both channels exactly
as it will in production.

## 9. Testing setup

```bash
npx tsc --noEmit                       # run this constantly
npx expo install --dev jest jest-expo @testing-library/react-native
```

```js
// jest.config.js
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
}
```

`jest.setup.ts` is where native modules get mocked — SecureStore, notifications, SQLite. Expect
to maintain it; a native module has no JS implementation under Jest.

E2E (M7) uses Maestro, flows as YAML in `.maestro/`:

```bash
maestro test .maestro/onboard.yaml
```

### Device matrix for M7

- One iPhone (iOS 26+)
- **Your physical Android.** Aggressive OEM battery optimisation is exactly the failure mode
  that justifies keeping the WhatsApp fallback, and neither a Pixel nor the emulator will show
  it to you.
- One wide-screen check (tablet or landscape) for layout, not as a supported target

## 10. Makefile additions

```make
mobile:
	cd nudj-mobile && npx expo start --dev-client

mobile-ios:
	cd nudj-mobile && npx expo start --dev-client --ios

mobile-android:
	cd nudj-mobile && npx expo start --dev-client --android

mobile-typecheck:
	cd nudj-mobile && npx tsc --noEmit

mobile-build-dev:
	cd nudj-mobile && eas build --profile development --platform android
```

## 11. What it costs

| Item | Cost |
|---|---|
| Expo account + EAS | Free tier: limited cloud builds per month on a shared queue. `eas build --local` is unlimited — and the native toolchain for it is now proven on this machine. |
| Apple Developer Program | $99/yr — needed at **M7** for TestFlight and device builds |
| Google Play Console | $25 one-time — needed at **M7** |
| **Total through M6** | **₹0** |
