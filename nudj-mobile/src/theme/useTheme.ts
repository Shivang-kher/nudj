import { useColorScheme } from 'react-native';

import { dark, light, type Palette } from '@/theme/tokens';

export function useTheme(): Palette {
  const scheme = useColorScheme(); // may return null
  return scheme === 'dark' ? dark : light; // null falls back to light
}
