import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { space, text } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

type ScreenProps = {
  title: string;
  children: ReactNode;
};

export function Screen({ title, children }: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.ground,
          paddingTop: insets.top + 10,
        },
      ]}
    >
      <Text
        style={[
          styles.title,
          {
            color: theme.ink,
            fontSize: text.title.size,
            fontWeight: text.title.weight,
            letterSpacing: text.title.letterSpacing,
          },
        ]}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: space.gutter,
  },
  title: {
    marginBottom: space.gap,
  },
});
