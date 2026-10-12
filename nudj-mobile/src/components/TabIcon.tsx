// The five stroke icons, matching the Design Sketchboard artboards exactly.
// Paths copied from the sketchboard tab bars — do not redraw these by hand;
// if the design changes, copy the new path data across verbatim.
// https://claude.ai/artifact/8S27fuay28KYKT1eK9TMHy
import type { ColorValue } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

export type TabIconName = 'home' | 'receipt' | 'calendar' | 'pie' | 'chat';

type TabIconProps = {
  name: TabIconName;
  color: ColorValue;
  size?: number;
};

export function TabIcon({ name, color, size = 21 }: TabIconProps) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
  };
  const stroke = {
    stroke: color,
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  switch (name) {
    case 'home':
      return (
        <Svg {...common}>
          <Path
            d="M3 10.6 12 3.5l9 7.1V20a1 1 0 0 1-1 1h-4.6v-6.2H9.6V21H4a1 1 0 0 1-1-1z"
            {...stroke}
          />
        </Svg>
      );
    case 'receipt':
      return (
        <Svg {...common}>
          <Path d="M5.5 3h13v18l-3.2-2.1-3.3 2.1-3.3-2.1L5.5 21z" {...stroke} />
          <Path d="M9 8h6M9 12h6" {...stroke} />
        </Svg>
      );
    case 'calendar':
      return (
        <Svg {...common}>
          <Rect x="3.5" y="5.5" width="17" height="15.5" rx="3" {...stroke} />
          <Path d="M8 3v4M16 3v4M3.5 11h17" {...stroke} />
        </Svg>
      );
    case 'pie':
      return (
        <Svg {...common}>
          <Path d="M12 3.2a8.8 8.8 0 1 0 8.8 8.8H12z" {...stroke} />
          <Path d="M14.6 3.6A8.8 8.8 0 0 1 20.4 9.4h-5.8z" {...stroke} />
        </Svg>
      );
    case 'chat':
      return (
        <Svg {...common}>
          <Path d="M4 5.5h16v10.2H9.4L4 20z" {...stroke} />
        </Svg>
      );
  }
}
