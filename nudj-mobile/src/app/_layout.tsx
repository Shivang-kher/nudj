import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { dark, light } from '@/theme/tokens';

export default function RootLayout() {
  const scheme = useColorScheme();
  const theme = scheme === 'dark' ? dark : light;

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: theme.ground }}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <Stack screenOptions={{ headerShown: false }} />
      </View>
    </SafeAreaProvider>
  );
}
