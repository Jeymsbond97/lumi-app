// Whether the camera panel is open: the readings (head, waist, lift) and the task card sit where the panel is,
// so the layout hides them meanwhile. A tiny store shared by the panel and the status around every screen.
import { useSyncExternalStore } from 'react';

let open = false;
const listeners = new Set<() => void>();

export function setCameraOpen(on: boolean): void {
  if (on === open) return;
  open = on;
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const useCameraOpen = (): boolean => useSyncExternalStore(subscribe, () => open, () => open);
