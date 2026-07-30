// Brand tokens, ported 1:1 from the web portal's CSS custom properties
// (reference-web-app/sites/eyescout-portal/login.html :root + .field/.tab/etc.)

export const colors = {
  bg: '#111111',
  card: '#141414',
  cardBorderFill: '#1c1c1c', // g-border inner fill
  field: '#1a1a1a',
  fieldBorder: 'rgba(255,255,255,0.08)',
  fieldFocusBorder: 'rgba(30,144,255,0.5)',
  white: '#ffffff',
  muted: 'rgba(255,255,255,0.7)',
  faint: 'rgba(255,255,255,0.3)',
  hairline: 'rgba(255,255,255,0.06)',
  blue: '#1E90FF',
  blueSoft: 'rgba(30,144,255,0.7)',
  err: '#ff5555',
  navBg: 'rgba(17,17,17,0.92)',
} as const;

import type { ColorValue } from 'react-native';

// linear-gradient(90deg, #7B2FBE 0%, #1E90FF 38%, #00C9A7 70%, #39D353 100%)
export const gradient = {
  colors: ['#7B2FBE', '#1E90FF', '#00C9A7', '#39D353'] as [ColorValue, ColorValue, ColorValue, ColorValue],
  locations: [0, 0.38, 0.7, 1] as [number, number, number, number],
  // horizontal (90deg) — left→right
  start: { x: 0, y: 0.5 },
  end: { x: 1, y: 0.5 },
};
