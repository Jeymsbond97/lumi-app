export const colors = {
  bg: '#0a0b0d',
  text: '#e9ecef',
  textSoft: '#c9d6cf',
  mint: '#7fe0a6',
  mintBright: '#9ff0bf',
  green: '#2f9e5b',
  floorGreen: '#173022',
} as const;

/** The robot screens' look (style D, "mono industrial"): white and grey, one red, green only for live power. */
export const mono = {
  text: '#e8e8e8',
  soft: '#8a8a8a',
  dim: '#555555',
  red: '#ff2d2d',
  green: '#3dff8b',
  blue: '#4d9bff',
  yellow: '#ffcf33',
  glass: 'rgba(0,0,0,0.5)',
} as const;

export const fonts = {
  title: 'Unbounded_600SemiBold',
  body: 'HankenGrotesk_400Regular',
  medium: 'HankenGrotesk_500Medium',
  semibold: 'HankenGrotesk_600SemiBold',
  /** Dot matrix, Latin and digits only: the name, the battery number and STOP. */
  dot: 'Doto_900Black',
  /** Every small label on the robot screens. No Hangul: Korean falls back to the system font by itself. */
  mono: 'JetBrainsMono_400Regular',
  monoBold: 'JetBrainsMono_600SemiBold',
} as const;

export const clamp = (min: number, v: number, max: number) => Math.min(max, Math.max(min, v));
