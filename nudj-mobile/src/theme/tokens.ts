// Design tokens — the exact values from the sketchboard's Foundations board.
// One file, no logic.

export const light: Record<
  | 'ground'
  | 'surface'
  | 'tile'
  | 'border'
  | 'border2'
  | 'ink'
  | 'muted'
  | 'faint'
  | 'accent'
  | 'accentSoft'
  | 'accentInk'
  | 'up'
  | 'down'
  | 'due'
  | 'dueSoft'
  | 'dueInk',
  string
> = {
  ground: '#F4F6F5',
  surface: '#FFFFFF',
  tile: '#EDF0EE',
  border: '#E2E6E3',
  border2: '#CBD3CE',
  ink: '#0E1613',
  muted: '#5F6B65',
  faint: '#737E78',
  accent: '#0E7C63',
  accentSoft: '#DDEFE8',
  accentInk: '#0A5F4C',
  up: '#0B7A54',
  down: '#C0392B',
  due: '#9A6B0E',
  dueSoft: '#F7EEDA',
  dueInk: '#7A5409',
};

// `dark` must satisfy `Palette` — neither palette can drift and miss a key.
export const dark: Palette = {
  ground: '#0D1210',
  surface: '#161D1A',
  tile: '#1E2723',
  border: '#2A332E',
  border2: '#3A443E',
  ink: '#E9EDEA',
  muted: '#9BA5A0',
  faint: '#8B958F',
  accent: '#3FD6A8',
  accentSoft: '#12352C',
  accentInk: '#5FE0B8',
  up: '#3FD6A8',
  down: '#F2785C',
  due: '#E0A94A',
  dueSoft: '#2E2510',
  dueInk: '#E0A94A',
};

export type Palette = typeof light;

export const radius = { card: 20, tile: 16, button: 16, pill: 999 } as const;

export const space = { gutter: 16, cardPad: 20, gap: 12 } as const;

// Note on letter-spacing: React Native takes `letterSpacing` in points, not
// `em`. The sketchboard's `-0.028em` at 34px becomes `-0.95`. The arithmetic
// is done once, here.
export const text = {
  display: { size: 34, weight: '700', letterSpacing: -0.95 },
  title: { size: 21, weight: '700', letterSpacing: -0.42 },
  body: { size: 15, weight: '500' },
  caption: { size: 13, weight: '400' },
  micro: {
    size: 10,
    weight: '400',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
} as const;
