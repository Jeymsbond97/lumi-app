import type { Connection } from './connection';

// The network Lumi answered on. Set by the loading screen, read by the screens after it.
let current: Connection | null = null;

export const session = {
  get connection() {
    return current;
  },
  set(c: Connection | null) {
    current = c;
  },
};
