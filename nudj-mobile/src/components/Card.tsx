import type { ReactNode } from 'react';
import { useColorScheme, View } from 'react-native';

import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

type CardProps = {
  children: ReactNode;
};

export function Card({ children }: CardProps) {
  const theme = useTheme();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  return (
    <View
      style={[
        {
          backgroundColor: theme.surface,
          borderRadius: radius.card,
          padding: space.cardPad,
        },
        // light: soft shadow. dark: 1px border — a shadow is invisible on dark ground.
        isDark
          ? { borderWidth: 1, borderColor: theme.border }
          : {
              shadowColor: '#0E1613',
              shadowOpacity: 0.06,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: 8 },
              elevation: 2,
            },
      ]}
    >
      {children}
    </View>
  );
}
