import type { ExpoConfig } from '@expo/config-types';

const config: ExpoConfig = {
  name: 'Nudj',
  slug: 'nudj',
  owner: 'shivangkher',
  scheme: 'nudj', // needed for M1's OAuth deep link
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic', // required, or dark mode never triggers
  // newArchEnabled is omitted: SDK 57 / RN 0.86 removed the flag from
  // ExpoConfig because the New Architecture is now the only architecture.
  icon: './assets/images/icon.png',
  ios: {
    bundleIdentifier: 'com.nudj.app',
    supportsTablet: false,
  },
  android: {
    package: 'com.nudj.app',
    adaptiveIcon: {
      backgroundColor: '#0E7C63',
      foregroundImage: './assets/images/android-icon-foreground.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
  },
  platforms: ['ios', 'android'],
  plugins: ['expo-router'],
  extra: {
    eas: {
      // `eas init` cannot write to a TypeScript config, so this is set by hand.
      projectId: '1478e8a7-c56e-4d49-aea9-eac0b6a1137e',
    },
  },
};

export default config;
