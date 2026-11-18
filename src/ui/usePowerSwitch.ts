// Switching the body and the arm on and off, asked first in ConfirmDialog: the status bar's chips on every screen and
// the Drive screen's panels use the same steps.
// Arm: off powers on; powered (disabled) enables or powers off; enabled disables (powering off goes through disabled
// first). Free drive and a fault are handled at the arm itself, so they are only shown.
// Body: disabled enables, enabled disables; a silent controller or an older robot API cannot be switched.
import { useCallback, useEffect, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { setArmEnabled, setArmPower, setBodyEnabled, type ArmState, type Body } from '../lib/api';
import { useI18n, type TextKey } from '../lib/i18n';
import { useRobot } from '../lib/robot';
import type { ConfirmRequest } from './ConfirmDialog';

const NOTE_MS = 2500;
const BUSY_MAX_MS = 8000;

export type BodyState = 'off' | 'on' | 'disabled' | 'enabled';

/** off: the controller does not answer; on: it answers but the robot's API does not say whether it is enabled. */
export function bodyState(body: Body | null): BodyState {
  if (!body) return 'off';
  if (body.enabled === null) return 'on';
  return body.enabled ? 'enabled' : 'disabled';
}

export interface PowerSwitch {
  arm: ArmState;
  body: BodyState;
  busyArm: boolean;
  busyBody: boolean;
  switchArm: () => void;
  switchBody: () => void;
  /** A switch the robot did not answer, for a moment. */
  note: TextKey | null;
  /** The question to show in a ConfirmDialog, and how to close it. */
  ask: ConfirmRequest | null;
  closeAsk: () => void;
}

export function usePowerSwitch(): PowerSwitch {
  const { t } = useI18n();
  const { connection, status } = useRobot();
  // the state of the part when a switch was sent: it shows busy until the robot reports a different one
  const [sentFrom, setSentFrom] = useState<{ part: 'arm' | 'body'; from: string } | null>(null);
  const [note, setNote] = useState<TextKey | null>(null);
  const [ask, setAsk] = useState<ConfirmRequest | null>(null);
  const closeAsk = useCallback(() => setAsk(null), []);
  const arm = status?.armState ?? 'off';
  const bodyNow = bodyState(status?.body ?? null);
  const busyArm = sentFrom?.part === 'arm' && sentFrom.from === arm;
  const busyBody = sentFrom?.part === 'body' && sentFrom.from === bodyNow;

  useEffect(() => {
    if (!note) return;
    const id = setTimeout(() => setNote(null), NOTE_MS);
    return () => clearTimeout(id);
  }, [note]);

  // if the robot never reports the change, the chip stops waiting after a while
  useEffect(() => {
    if (!sentFrom) return;
    const id = setTimeout(() => setSentFrom(null), BUSY_MAX_MS);
    return () => clearTimeout(id);
  }, [sentFrom]);

  const send = (part: 'arm' | 'body', call: Promise<unknown>) => {
    setSentFrom({ part, from: part === 'arm' ? arm : bodyNow });
    call.catch(() => {
      setSentFrom(null);
      setNote('noAnswer');
    });
  };

  const switchArm = () => {
    if (busyArm || arm === 'drag' || arm === 'error') return;
    Haptics.selectionAsync().catch(() => {});
    const url = connection.baseUrl;
    if (arm === 'off') {
      setAsk({ title: t('armPowerAsk'), choices: [{ text: t('powerOn'), onPress: () => send('arm', setArmPower(url, true)) }] });
    } else if (arm === 'disabled') {
      setAsk({
        title: t('armEnableAsk'),
        choices: [
          { text: t('powerOff'), destructive: true, onPress: () => send('arm', setArmPower(url, false)) },
          { text: t('enable'), onPress: () => send('arm', setArmEnabled(url, true)) },
        ],
      });
    } else {
      setAsk({
        title: t('armDisableAsk'),
        choices: [{ text: t('disable'), destructive: true, onPress: () => send('arm', setArmEnabled(url, false)) }],
      });
    }
  };

  const switchBody = () => {
    if (busyBody || (bodyNow !== 'enabled' && bodyNow !== 'disabled')) return;
    Haptics.selectionAsync().catch(() => {});
    const on = bodyNow === 'disabled';
    setAsk({
      title: t(on ? 'bodyEnableAsk' : 'bodyDisableAsk'),
      choices: [{ text: t(on ? 'enable' : 'disable'), destructive: !on, onPress: () => send('body', setBodyEnabled(connection.baseUrl, on)) }],
    });
  };

  return { arm, body: bodyNow, busyArm, busyBody, switchArm, switchBody, note, ask, closeAsk };
}

export const BODY_TEXT: Record<BodyState, TextKey> = { off: 'bodyOff', on: 'bodyOn', disabled: 'bodyDisabled', enabled: 'bodyEnabled' };
