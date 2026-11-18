// One camera's live picture (lib/camera): the newest picture asked for again and again while `active`, two pictures
// taking turns so the shown one never blanks while the next is on its way. Used by Home's camera panel and by Drive.
// Paused (another screen, the app in the background), the last picture is dropped: coming back shows WAITING until a
// new one has come, never minutes-old pictures (owner, 2026-11-18).
import { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import {
  cameraLive,
  FRAME_MS,
  FRAME_TIMEOUT_MS,
  hdUrl,
  INFO_MS,
  infoUrl,
  latestUrl,
  RETRY_MS,
  type CameraInfo,
  type CameraName,
} from '../lib/camera';
import { useI18n, type TextKey } from '../lib/i18n';
import { fonts, mono } from './theme';

const NAME_TEXT: Record<CameraName, TextKey> = { head: 'cameraHead', torso: 'cameraTorso' };
/** Two failed pictures in a row and the camera shows no picture until one comes again. */
const FAILS_SHOWN = 2;

/** Every picture address is new, also after the panel was closed and opened again. */
let pictureNumber = 0;
const nextNumber = () => ++pictureNumber;

type Slot = 0 | 1;

export function CameraFeed({
  name,
  baseUrl,
  width,
  height,
  active,
  label,
  bare = false,
  frameMs = FRAME_MS,
  hd = false,
}: {
  name: CameraName;
  baseUrl: string;
  width: number;
  height: number;
  active: boolean;
  label: number;
  /** No frame and no name tag: a picture that fills the screen. */
  bare?: boolean;
  /** At most one new picture this often. */
  frameMs?: number;
  /** The camera's own size (1280 x 720) instead of 640 px: for a picture that fills the screen. */
  hd?: boolean;
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
    let big = hd; // falls back to the 640 px picture when the robot has no hd.jpg yet
    let bigSeen = false;
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
      const uri = (big ? hdUrl : latestUrl)(baseUrl, name, nextNumber());
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
      if (big && !bigSeen) {
        big = false;
        return later(ask, 0);
      }
      fails += 1;
      if (fails >= FAILS_SHOWN) setFailed(true);
      later(ask, RETRY_MS);
    };
    const loaded = (uri: string, slot: Slot) => {
      if (!on || uri !== pending) return;
      clearTimeout(watchdog);
      pending = null;
      fails = 0;
      if (big) bigSeen = true;
      shown = slot;
      shownSlot.current = slot;
      setFailed(false);
      setFront(slot);
      later(ask, Math.max(0, frameMs - (Date.now() - askedAt)));
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
      // the last picture would show again on coming back, old by then: drop it
      shownSlot.current = null;
      setFront(null);
      setUris([null, null]);
    };
  }, [active, baseUrl, name, frameMs, hd]);

  const showing = front !== null && !failed && live;
  const quiet = failed || !live ? t('cameraNoPicture') : front === null ? t('cameraWaiting') : null;

  return (
    <View style={[bare ? styles.bare : styles.picture, { width, height }]}>
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
      {!bare && (
        <View style={[styles.tag, { gap: label * 0.5, paddingHorizontal: label * 0.7, paddingVertical: label * 0.3 }]} pointerEvents="none">
          <View style={[styles.dot, { width: label * 0.55, height: label * 0.55 }, showing ? styles.dotLive : styles.dotOff]} />
          <Text style={[styles.tagText, { fontSize: label }]}>{t(NAME_TEXT[name])}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  picture: { borderRadius: 10, overflow: 'hidden', backgroundColor: '#050505', borderWidth: 1, borderColor: '#222' },
  bare: { overflow: 'hidden', backgroundColor: '#050505' },
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
});
