// Lumi's cameras on every section (Home, Map and the ones to come): a small camera button on the right edge, halfway
// down. Tapped, it opens a panel against the right edge with the head camera over the torso camera, between the
// battery and the joystick and clear of the middle (on a phone on its side, left of the joystick down to the dock,
// where the pictures can be bigger); the cross on it closes it back to the button. It stays open across sections.
// Each camera's newest picture is asked for about 5 times a second, only while the panel is open and the app is in
// the foreground. Two pictures take turns: the next one loads hidden behind the shown
// one, so a picture never blanks while the next is on its way.
import { useEffect, useRef, useState } from 'react';
import { AppState, Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import {
  cameraLayout,
  cameraLive,
  FRAME_MS,
  FRAME_TIMEOUT_MS,
  INFO_MS,
  infoUrl,
  latestUrl,
  RETRY_MS,
  type CameraInfo,
  type CameraName,
} from '../lib/camera';
import { setCameraOpen } from '../lib/cameraOpen';
import { useI18n, type TextKey } from '../lib/i18n';
import { useRobot } from '../lib/robot';
import { clamp, fonts, mono } from './theme';

const NAME_TEXT: Record<CameraName, TextKey> = { head: 'cameraHead', torso: 'cameraTorso' };
/** Two failed pictures in a row and the camera shows no picture until one comes again. */
const FAILS_SHOWN = 2;

/** Every picture address is new, also after the panel was closed and opened again. */
let pictureNumber = 0;
const nextNumber = () => ++pictureNumber;

function CameraIcon({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round">
      <Path d="M4 7.5h3.2L8.8 5h6.4l1.6 2.5H20a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8.5a1 1 0 0 1 1-1z" />
      <Circle cx={12} cy={13} r={3.6} />
    </Svg>
  );
}

/** Drawn like the map's cross (the ✕ glyph differs from font to font). */
function Cross({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M6 6l12 12M18 6L6 18" stroke={color} strokeWidth={2.4} fill="none" strokeLinecap="round" />
    </Svg>
  );
}

type Slot = 0 | 1;

function CameraFeed({
  name,
  baseUrl,
  width,
  height,
  active,
  label,
}: {
  name: CameraName;
  baseUrl: string;
  width: number;
  height: number;
  active: boolean;
  label: number;
}) {
  const { t } = useI18n();
  const [uris, setUris] = useState<[string | null, string | null]>([null, null]);
  const [front, setFront] = useState<Slot | null>(null);
  const [failed, setFailed] = useState(false);
  const [live, setLive] = useState(true);
  // the Image events reach the loop made by the effect below through this
  const shownSlot = useRef<Slot | null>(null); // kept when the loop pauses, so a new loop loads behind the shown picture
  const events = useRef<{ loaded: (uri: string, slot: Slot) => void; failed: (uri: string) => void } | null>(null);

  useEffect(() => {
    if (!active) return;
    let on = true;
    let shown = shownSlot.current;
    let pending: string | null = null;
    let askedAt = 0;
    let fails = 0;
    let next: ReturnType<typeof setTimeout> | undefined;
    let watchdog: ReturnType<typeof setTimeout> | undefined;

    const later = (fn: () => void, ms: number) => {
      clearTimeout(next);
      next = setTimeout(fn, ms);
    };
    // the next picture goes into the hidden slot; it is shown once it has loaded
    const ask = () => {
      if (!on) return;
      const slot: Slot = shown === 0 ? 1 : 0;
      const uri = latestUrl(baseUrl, name, nextNumber());
      pending = uri;
      askedAt = Date.now();
      setUris((u) => (slot === 0 ? [uri, u[1]] : [u[0], uri]));
      clearTimeout(watchdog);
      watchdog = setTimeout(() => fail(uri), FRAME_TIMEOUT_MS);
    };
    const fail = (uri: string) => {
      if (!on || uri !== pending) return;
      clearTimeout(watchdog);
      pending = null;
      fails += 1;
      if (fails >= FAILS_SHOWN) setFailed(true);
      later(ask, RETRY_MS);
    };
    const loaded = (uri: string, slot: Slot) => {
      if (!on || uri !== pending) return;
      clearTimeout(watchdog);
      pending = null;
      fails = 0;
      shown = slot;
      shownSlot.current = slot;
      setFailed(false);
      setFront(slot);
      later(ask, Math.max(0, FRAME_MS - (Date.now() - askedAt)));
    };
    events.current = { loaded, failed: fail };
    ask();

    // latest.jpg keeps giving the last picture of a camera that stopped; the camera's state tells
    const info = async () => {
      const abort = new AbortController();
      const stop = setTimeout(() => abort.abort(), INFO_MS - 200);
      try {
        const res = await fetch(infoUrl(baseUrl, name), { signal: abort.signal });
        if (res.ok && on) setLive(cameraLive((await res.json()) as CameraInfo));
      } catch {
        // the pictures themselves show a camera that does not answer
      } finally {
        clearTimeout(stop);
      }
    };
    info();
    const infoTimer = setInterval(info, INFO_MS);

    return () => {
      on = false;
      events.current = null;
      clearTimeout(next);
      clearTimeout(watchdog);
      clearInterval(infoTimer);
    };
  }, [active, baseUrl, name]);

  const showing = front !== null && !failed && live;
  const quiet = failed || !live ? t('cameraNoPicture') : front === null ? t('cameraWaiting') : null;

  return (
    <View style={[styles.picture, { width, height }]}>
      {([0, 1] as const).map((slot) =>
        uris[slot] ? (
          <Image
            key={slot}
            source={{ uri: uris[slot] }}
            onLoad={() => uris[slot] && events.current?.loaded(uris[slot], slot)}
            onError={() => uris[slot] && events.current?.failed(uris[slot])}
            fadeDuration={0}
            resizeMode="cover"
            style={[StyleSheet.absoluteFill, { opacity: showing && front === slot ? 1 : 0 }]}
            accessibilityIgnoresInvertColors
          />
        ) : null,
      )}
      {quiet && (
        <View style={styles.quiet} pointerEvents="none">
          <Text style={[styles.quietText, { fontSize: label }]}>{quiet}</Text>
        </View>
      )}
      <View style={[styles.tag, { gap: label * 0.5, paddingHorizontal: label * 0.7, paddingVertical: label * 0.3 }]} pointerEvents="none">
        <View style={[styles.dot, { width: label * 0.55, height: label * 0.55 }, showing ? styles.dotLive : styles.dotOff]} />
        <Text style={[styles.tagText, { fontSize: label }]}>{t(NAME_TEXT[name])}</Text>
      </View>
    </View>
  );
}

export function CameraPanel() {
  const { t } = useI18n();
  const { connection } = useRobot();
  const { width, height } = useWindowDimensions();
  const inset = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setForeground(s === 'active'));
    return () => sub.remove();
  }, []);

  const lay = cameraLayout({ width, height, insetTop: inset.top, insetRight: inset.right, insetBottom: inset.bottom });
  const label = clamp(9, 0.016 * height, 12);
  const active = open && foreground;
  const toggle = (o: boolean) => {
    Haptics.selectionAsync().catch(() => {});
    setOpen(o);
  };
  // the layout hides the readings and the task card under the panel while it shows
  useEffect(() => {
    setCameraOpen(open);
    return () => setCameraOpen(false);
  }, [open]);

  if (!open) {
    return (
      <Animated.View
        key="button"
        entering={FadeIn.duration(180)}
        style={[
          styles.tab,
          { top: lay.buttonTop, width: lay.buttonWidth + inset.right, height: lay.buttonHeight, paddingRight: inset.right },
        ]}
      >
        <Pressable
          onPress={() => toggle(true)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('cameraOpen')}
          style={({ pressed }) => [styles.tabPress, pressed && styles.pressed]}
        >
          <CameraIcon size={lay.buttonHeight * 0.45} color={mono.text} />
        </Pressable>
      </Animated.View>
    );
  }

  const close = clamp(26, label * 2.6, 32);
  return (
    <Animated.View
      key="panel"
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(150)}
      style={[
        styles.panel,
        { top: lay.top, padding: lay.pad, gap: lay.pad },
        lay.right > 0 ? [styles.panelFree, { right: lay.right }] : { paddingRight: lay.pad + inset.right },
      ]}
    >
      {(['head', 'torso'] as const).map((name) => (
        <CameraFeed
          key={name}
          name={name}
          baseUrl={connection.baseUrl}
          width={lay.pictureWidth}
          height={lay.pictureHeight}
          active={active}
          label={label}
        />
      ))}
      <Pressable
        onPress={() => toggle(false)}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={t('cameraClose')}
        style={({ pressed }) => [
          styles.close,
          {
            top: lay.pad + 6,
            right: lay.pad + (lay.right > 0 ? 0 : inset.right) + 6,
            width: close,
            height: close,
            borderRadius: close / 2,
          },
          pressed && styles.pressed,
        ]}
      >
        <Cross size={close * 0.42} color={mono.text} />
      </Pressable>
    </Animated.View>
  );
}

const glass = { backgroundColor: 'rgba(8,8,8,0.92)', borderColor: '#333', borderWidth: 1, borderRightWidth: 0 };

const styles = StyleSheet.create({
  tab: { position: 'absolute', right: 0, borderTopLeftRadius: 14, borderBottomLeftRadius: 14, ...glass },
  tabPress: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  panel: { position: 'absolute', right: 0, borderTopLeftRadius: 16, borderBottomLeftRadius: 16, ...glass },
  // on a phone the panel sits left of the joystick, away from the edge: round and framed on every side
  panelFree: { borderRadius: 16, borderRightWidth: 1 },
  picture: { borderRadius: 10, overflow: 'hidden', backgroundColor: '#050505', borderWidth: 1, borderColor: '#222' },
  quiet: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  quietText: { fontFamily: fonts.mono, color: mono.soft, letterSpacing: 1, textTransform: 'uppercase' },
  tag: {
    position: 'absolute',
    left: 6,
    top: 6,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  tagText: { fontFamily: fonts.monoBold, color: mono.text, letterSpacing: 1.5, textTransform: 'uppercase' },
  dot: { borderRadius: 99 },
  dotLive: { backgroundColor: mono.green },
  dotOff: { borderWidth: 1, borderColor: mono.soft },
  close: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(232,232,232,0.2)',
  },
  pressed: { opacity: 0.6 },
});
