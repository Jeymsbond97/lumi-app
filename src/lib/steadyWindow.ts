// The window's size for layout, steady while a keyboard is up. On the tablet (Android, Expo Go, full screen) opening a
// keyboard brings the system navigation bar back, and the window reads 55 px shorter (901 -> 846.6) until it closes:
// every panel sized or placed from the height (the modes, the tiles, the Dock) moved up and back down (owner,
// 2026-11-24, measured with keyboard and dimension logs). So the height kept is the tallest seen at this width; a new
// width (turning the screen) starts again. A browser has no such keyboard: there it is the window as it is.
import { Platform, useWindowDimensions } from 'react-native';

export interface Size {
  width: number;
  height: number;
}

/** The height to lay out with: the tallest seen at this width, else this one. */
export function steadySize(prev: Size | null, now: Size): Size {
  if (!prev || Math.abs(prev.width - now.width) >= 1) return now;
  return now.height >= prev.height ? now : prev;
}

let kept: Size | null = null;

/** The steady size for the window now, shared by every panel (one memory, so a dialog opened over a keyboard gets it
 *  too). */
function keep(now: Size): Size {
  kept = steadySize(kept, now);
  return kept;
}

/** useWindowDimensions with the steady height (steadySize). */
export function useSteadyWindow() {
  const win = useWindowDimensions();
  if (Platform.OS === 'web') return win; // a browser window made shorter is really shorter
  return { ...win, height: keep({ width: win.width, height: win.height }).height };
}
