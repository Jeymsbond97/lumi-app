// While the landing view still covers the robot screens (Home shows it until the 3D robot is drawn), the controls
// that sit on top of every screen stay hidden, STOP included, so the landing view is all that shows.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

interface Landing {
  /** True until the first screen says it is drawn. */
  covering: boolean;
  done: () => void;
}

const LandingContext = createContext<Landing>({ covering: false, done: () => {} });

export function LandingProvider({ children }: { children: ReactNode }) {
  const [covering, setCovering] = useState(true);
  const done = useCallback(() => setCovering(false), []);
  const value = useMemo(() => ({ covering, done }), [covering, done]);
  return <LandingContext.Provider value={value}>{children}</LandingContext.Provider>;
}

export const useLanding = () => useContext(LandingContext);
