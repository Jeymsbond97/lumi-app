export const colors = {
  bg: '#0a0b0d',
  text: '#e9ecef',
  textSoft: '#c9d6cf',
  mint: '#7fe0a6',
  mintBright: '#9ff0bf',
  green: '#2f9e5b',
  floorGreen: '#173022',
} as const;

export const fonts = {
  title: 'Unbounded_600SemiBold',
  body: 'HankenGrotesk_400Regular',
  medium: 'HankenGrotesk_500Medium',
  semibold: 'HankenGrotesk_600SemiBold',
} as const;

export const clamp = (min: number, v: number, max: number) => Math.min(max, Math.max(min, v));
