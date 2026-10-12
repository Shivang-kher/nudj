// The M0 exit-test card. Every tab renders this — boring on purpose.
import { Text } from 'react-native';

import { Card } from '@/components/Card';
import { formatInr, USE_INTL } from '@/lib/money';
import { text } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

export function SmokeCard() {
  const theme = useTheme();

  return (
    <Card>
      <Text
        style={{
          color: theme.muted,
          fontSize: text.micro.size,
          fontWeight: text.micro.weight,
          letterSpacing: text.micro.letterSpacing,
          textTransform: text.micro.textTransform,
        }}
      >
        M0 SMOKE TEST
      </Text>
      <Text
        style={{
          color: theme.ink,
          fontSize: text.display.size,
          fontWeight: text.display.weight,
          letterSpacing: text.display.letterSpacing,
          marginTop: 4,
        }}
      >
        {formatInr(84216000)}
      </Text>
      <Text
        style={{
          color: theme.up,
          fontSize: text.body.size,
          fontWeight: text.body.weight,
          marginTop: 4,
        }}
      >
        ▲ {formatInr(8616000)}
      </Text>
      <Text
        style={{
          color: theme.muted,
          fontSize: text.caption.size,
          fontWeight: text.caption.weight,
          marginTop: 8,
        }}
      >
        Intl grouping: {USE_INTL ? 'native' : 'fallback'}
      </Text>
    </Card>
  );
}
