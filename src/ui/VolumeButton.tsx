// COMMANDS' volume (owner, 2026-11-23): a speaker icon on the left edge where Home has its WAVE (level with the camera
// tab; right of STOP on a short screen), not a tile. A tap opens an upright fader beside it (SpeedFader, 0 to 100 %):
// drag or tap + / −; the robot gets the value when the finger lifts (POST /volume). A tap outside closes it.
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { cameraLayout } from '../lib/camera';
import { read, send, toVolume, volumeRequest } from '../lib/commands';
import { useI18n } from '../lib/i18n';
import { useRobot } from '../lib/robot';
import { CommandIcon } from './CommandIcon';
import { modesBox } from './ModesPanel';
import { SpeedFader } from './SpeedFader';
import { nameBlockBottom } from './StatusHud';
import { stopSize } from './StopButton';
import { clamp, fonts, mono } from './theme';

const GAP = 18; // as WaveButton: at least this from the modes below and the name above
const RANGE = { min: 0, max: 100 };
const NOTE_MS = 3500;

export function VolumeButton({ active }: { active: boolean }) {
  const { t } = useI18n();
  const { connection } = useRobot();
  const url = connection.baseUrl;
  const { width: w, height: h } = useWindowDimensions();
  const inset = useSafeAreaInsets();
  const [opened, setOpen] = useState(false);
  const open = opened && active; // leaving the screen closes it
  const [volume, setVolume] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // read when the screen shows and each time the fader opens (someone may have changed it by voice)
  useEffect(() => {
    if (!active) return;
    let on = true;
    read(url, '/volume').then((r) => on && setVolume(toVolume(r)));
    return () => {
      on = false;
    };
  }, [active, open, url]);
  useEffect(() => {
    if (!note) return;
    const id = setTimeout(() => setNote(null), NOTE_MS);
    return () => clearTimeout(id);
  }, [note]);

  // the same place as Home's WaveButton
  const cam = cameraLayout({ width: w, height: h, insetTop: inset.top, insetRight: inset.right, insetBottom: inset.bottom });
  const tabH = cam.buttonHeight;
  const tabW = cam.buttonWidth;
  const modes = modesBox(h, inset.bottom);
  const modesTop = h - modes.bottom - modes.height;
  const edge = cam.buttonTop + tabH + GAP <= modesTop && cam.buttonTop >= nameBlockBottom(h, inset.top) + GAP;
  const stop = stopSize(h);
  const left = edge ? 0 : 24 + inset.left + stop * 1.3 + 12;
  const place = edge ? { left, top: cam.buttonTop } : { left, bottom: 18 + inset.bottom + (stop - tabH) / 2 };

  // the fader: small and narrow, upright beside the button with its middle level with it, never down over the modes
  // (owner, 2026-11-23: first it covered Greeter, then it rose too high)
  const size = clamp(11, 0.019 * h, 14);
  const faderW = clamp(48, 0.07 * h, 58);
  const faderH = clamp(150, 0.3 * h, 210);
  const btnTop = edge ? cam.buttonTop : h - (18 + inset.bottom + (stop - tabH) / 2) - tabH;
  const lowest = edge ? modesTop - GAP : h - inset.bottom - 12;
  const faderTop = Math.max(inset.top + 12, Math.min(btnTop + tabH / 2 - faderH / 2, lowest - faderH));
  const faderLeft = left + (edge ? tabW + inset.left : tabH) + 12;

  const sendVolume = (v: number) => {
    setVolume(v);
    send(url, { ...volumeRequest(v), timeoutMs: 4000 }).then((r) => {
      if (r.ok) return;
      setNote(r.status === 0 ? t('noAnswer') : (r.reason ?? t('cmdRefused')));
    });
  };

  return (
    <>
      {open && <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} accessibilityLabel={t('cancel')} />}
      <View style={[styles.root, place]} pointerEvents="box-none">
        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            setOpen((o) => !o);
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('cmdVolume')}
          accessibilityState={{ expanded: open }}
          style={({ pressed }) => [
            styles.tab,
            edge ? { width: tabW + inset.left, height: tabH, paddingLeft: inset.left } : [styles.free, { width: tabH, height: tabH }],
            open && styles.tabOpen,
            pressed && styles.pressed,
          ]}
        >
          <CommandIcon name="volume" size={tabH * 0.45} color={mono.text} />
        </Pressable>
        {note && (
          <Text style={[styles.note, { fontSize: size * 0.8, marginLeft: edge ? 12 + inset.left : 0 }]} numberOfLines={2}>
            {note}
          </Text>
        )}
      </View>
      {open && (
        <View style={[styles.fader, { left: faderLeft, top: faderTop }]}>
          {volume === null ? (
            <View style={[styles.waiting, { width: faderW, height: faderH }]}>
              <Text style={[styles.waitingText, { fontSize: size * 0.8 }]}>{t('noAnswer')}</Text>
            </View>
          ) : (
            <SpeedFader
              value={volume}
              range={RANGE}
              width={faderW}
              height={faderH}
              size={size}
              label={t('cmdVolume')}
              lessLabel={t('cmdVolumeDown')}
              moreLabel={t('cmdVolumeUp')}
              onChange={setVolume}
              onRelease={sendVolume}
              onStep={sendVolume}
              dot={Math.round(faderW * 0.42)}
            />
          )}
        </View>
      )}
    </>
  );
}

// the camera tab's glass (CameraPanel), open to the left edge, as WaveButton
const glass = { backgroundColor: 'rgba(8,8,8,0.92)', borderColor: '#333', borderWidth: 1, borderLeftWidth: 0 };

const styles = StyleSheet.create({
  root: { position: 'absolute', alignItems: 'flex-start', gap: 8 },
  tab: { alignItems: 'center', justifyContent: 'center', borderTopRightRadius: 14, borderBottomRightRadius: 14, ...glass },
  free: { borderRadius: 14, borderLeftWidth: 1 },
  tabOpen: { borderColor: mono.text },
  pressed: { opacity: 0.6 },
  fader: { position: 'absolute' },
  waiting: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#333',
    backgroundColor: 'rgba(8,8,8,0.92)',
    padding: 8,
  },
  waitingText: { fontFamily: fonts.mono, color: mono.soft, textAlign: 'center' },
  note: {
    fontFamily: fonts.mono,
    color: mono.yellow,
    maxWidth: 260,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.85)',
    overflow: 'hidden',
  },
});
