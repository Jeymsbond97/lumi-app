// The Drive screen's hold-to-move loop (lib/jog) tied to the screen: it ends when the screen is left (Tabs keep the
// screen alive, so leaving it is a blur, not an unmount), when the app leaves the foreground, on STOP, and when the
// screen goes away. A failed call or a failed step ends it too and says why.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useIsFocused } from 'expo-router';
import { BusyError, jog, jogStop } from '../lib/api';
import { onDriveStop } from '../lib/driveLock';
import type { TextKey } from '../lib/i18n';
import { createJogHold, holdAllowed, type JogCommand, type JogFailure, type JogHold } from '../lib/jog';
import { useRobot } from '../lib/robot';

const FAILURE_TEXT: Record<JogFailure, TextKey> = { busy: 'busy', noAnswer: 'noAnswer', refused: 'driveMoveFailed' };

export interface JogControl {
  /** What is held now, for the buttons' look. */
  held: JogCommand | null;
  /** touches: fingers on the screen when this one went down. */
  press: (cmd: JogCommand, touches?: number) => void;
  release: () => void;
}

export function useJogHold(onNote: (text: TextKey) => void): JogControl {
  const { connection } = useRobot();
  const focused = useIsFocused();
  const [held, setHeld] = useState<JogCommand | null>(null);
  // the latest values for the loop, which is made at the first press
  const url = useRef(connection.baseUrl);
  const note = useRef(onNote);
  useEffect(() => {
    url.current = connection.baseUrl;
    note.current = onNote;
  }, [connection.baseUrl, onNote]);

  const shown = useRef(focused);
  useEffect(() => {
    shown.current = focused;
  }, [focused]);

  const loop = useRef<JogHold | null>(null);
  const press = useCallback((cmd: JogCommand, touches = 1) => {
    if (!holdAllowed({ focused: shown.current, foreground: AppState.currentState === 'active', touches })) return;
    loop.current ??= createJogHold({
      send: (c) => jog(url.current, c),
      stop: () => jogStop(url.current),
      isBusy: (e) => e instanceof BusyError,
      onFail: (why, detail) => {
        if (__DEV__ && detail) console.warn('jog', detail);
        note.current(FAILURE_TEXT[why]);
      },
      onChange: setHeld,
    });
    loop.current.press(cmd);
  }, []);
  const release = useCallback(() => loop.current?.release(), []);

  // leaving the screen (another section) ends the hold
  useEffect(() => {
    if (!focused) release();
  }, [focused, release]);

  // the background, STOP, and the screen going away
  useEffect(() => {
    const app = AppState.addEventListener('change', (s) => {
      if (s !== 'active') release();
    });
    const offStop = onDriveStop(release);
    return () => {
      app.remove();
      offStop();
      release();
    };
  }, [release]);

  return { held, press, release };
}
