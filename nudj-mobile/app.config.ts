import type { ExpoConfig } from '@expo/config-types';

const config: ExpoConfig = {
  name: 'Nudj',
  slug: 'nudj',
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
};

export default config;
