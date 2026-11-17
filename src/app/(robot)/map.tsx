// The Map screen (owner's pick A2, 2026-11-16): the base's map in the middle with Lumi's live place and heading and the
// markers; a floating navbar on top (CONTROL, MARKERS, ROUTE, POSITION, MAPPING, MAPS, SETTINGS) with drop-down lists;
// a small bar at the bottom for what is picked (a marker or a tapped point): SAVE and GO, or SET POSITION.
// Route, mapping and settings come later (PLAN.md "Map section").
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import {
  BusyError,
  cancelDrive,
  deleteMarker,
  getMapInfo,
  getRoute,
  getScan,
  goMarker,
  goPoint,
  mapImageUrl,
  saveMarker,
  setPosition,
  startRoute,
  switchMap,
} from '../../lib/api';
import { addStop, keepKnown, PAUSE_MAX_S, removeStopAt, ROUNDS_MAX, stopNumbers, type RouteProgress } from '../../lib/route';
import {
  clampOffset,
  clampZoom,
  fitMap,
  footprintPx,
  headingFromDrag,
  nextMarkerName,
  pixelToWorld,
  scanToWorld,
  validMarkerName,
  worldToPixel,
  zoomAbout,
  type MapInfo,
  type MapMarker,
} from '../../lib/mapGeom';
import { useI18n, type TextKey } from '../../lib/i18n';
import { useRobot } from '../../lib/robot';
import { ConfirmDialog, type ConfirmRequest } from '../../ui/ConfirmDialog';
import { Joystick } from '../../ui/Joystick';
import { MarkerDialog } from '../../ui/MarkerDialog';
import { NameDialog } from '../../ui/NameDialog';
import { colors, fonts, mono } from '../../ui/theme';

const NOTE_MS = 2500;
const SWITCH_WAIT_MS = 15000; // the base restarts with another map before it answers again
const ZOOM_STEP = 1.5; // one press of + or -
const TAP_PX = 8; // a touch that moved less than this is a tap (picks a point), more is a drag (moves the map)
const DOCK_SPACE = 64; // room the sections dock takes at the bottom, above the safe area
const SCAN_EVERY_MS = 1000; // the lidar while setting the position
const NUDGE_M = 0.05; // one press of an arrow while setting the position
const TURN_RAD = (2 * Math.PI) / 180; // one press of a turn
const REPEAT_AFTER_MS = 400; // an arrow held this long starts repeating
const REPEAT_MS = 90; // then one step this often
const ROUTE_EVERY_MS = 1000; // a route's progress while the API drives it

type Item = 'control' | 'markers' | 'route' | 'position' | 'mapping' | 'maps' | 'settings';
type Menu = 'markers' | 'maps' | 'route';
const ITEMS: { key: Item; label: TextKey; list?: boolean; soon?: boolean }[] = [
  { key: 'control', label: 'mapControl' },
  { key: 'markers', label: 'mapMarkers', list: true },
  { key: 'position', label: 'mapPosition' },
  { key: 'mapping', label: 'mapMapping', soon: true },
  { key: 'maps', label: 'mapMaps', list: true },
  { key: 'settings', label: 'mapSettings', soon: true },
];

function Icon({ item, color }: { item: Item; color: string }) {
  const p = { stroke: color, strokeWidth: 1.8, fill: 'none' } as const;
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24">
      {item === 'control' && (
        <>
          <Circle cx={12} cy={12} r={8} {...p} />
          <Circle cx={12} cy={12} r={3} {...p} />
        </>
      )}
      {item === 'markers' && (
        <>
          <Path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z" {...p} />
          <Circle cx={12} cy={10} r={2} {...p} />
        </>
      )}
      {item === 'route' && <Path d="M6 18h7a3 3 0 0 0 0-6h-2a3 3 0 0 1 0-6h7" {...p} />}
      {item === 'position' && (
        <>
          <Path d="M12 2v4M12 18v4M2 12h4M18 12h4" {...p} />
          <Circle cx={12} cy={12} r={5} {...p} />
        </>
      )}
      {item === 'mapping' && <Path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15" {...p} />}
      {item === 'maps' && (
        <>
          <Rect x={3} y={4} width={18} height={16} rx={2} {...p} />
          <Path d="M3 10h18" {...p} />
        </>
      )}
      {item === 'settings' && (
        <>
          <Circle cx={12} cy={12} r={3} {...p} />
          <Path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" {...p} />
        </>
      )}
    </Svg>
  );
}

/** Lumi's base at its true size on the map (a rounded square) with an arrow to its front (+x of the pose). */
function Footprint({ size, stroke, fill, outline = true }: { size: number; stroke: string; fill: string; outline?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {outline ? (
        <Rect x={4} y={4} width={92} height={92} rx={20} stroke={stroke} strokeWidth={size < 16 ? 12 : 6} fill={fill} />
      ) : (
        <Circle cx={50} cy={50} r={Math.min(30, Math.max(12, (4.5 * 100) / size))} fill={stroke} />
      )}
      <Path
        d="M50 50 L86 50 M70 34 L86 50 L70 66"
        stroke={stroke}
        strokeWidth={size < 16 ? 12 : 8}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function Stepper({ label, value, onMinus, onPlus }: { label: string; value: string; onMinus: () => void; onPlus: () => void }) {
  return (
    <View style={styles.setting}>
      <Text style={styles.rowText}>{label}</Text>
      <View style={styles.stepper}>
        <Pressable
          onPress={onMinus}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={`${label} -`}
          style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed]}
        >
          <Text style={styles.zoomText}>−</Text>
        </Pressable>
        <Text style={styles.stepValue}>{value}</Text>
        <Pressable
          onPress={onPlus}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={`${label} +`}
          style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed]}
        >
          <Text style={styles.zoomText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** A small down (or up) chevron for things that open, drawn instead of a ▾ glyph (the fonts draw it unevenly). */
function Chevron({ up = false, color = mono.soft, size = 12 }: { up?: boolean; color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d={up ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'}
        stroke={color}
        strokeWidth={2.4}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** A close or remove cross, drawn like the chevron (the ✕ glyph differs from font to font). */
function Cross({ color = mono.soft, size = 12 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M6 6l12 12M18 6L6 18" stroke={color} strokeWidth={2.4} fill="none" strokeLinecap="round" />
    </Svg>
  );
}

function Pencil() {
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24">
      <Path d="M4 20h4L19 9l-4-4L4 16zM13 7l4 4" stroke={mono.soft} strokeWidth={1.8} fill="none" strokeLinejoin="round" />
    </Svg>
  );
}

const PURPLE = '#b46cff'; // the scan at the new place, as on the base's own page

/** One step on a press; held, it keeps stepping until let go. */
function NudgeButton({ label, onPress }: { label: string; onPress: () => void }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const step = useRef(onPress);
  useEffect(() => {
    step.current = onPress;
  }, [onPress]);
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const start = () => {
    stop();
    step.current();
    const again = (wait: number) => {
      timer.current = setTimeout(() => {
        step.current();
        again(REPEAT_MS);
      }, wait);
    };
    again(REPEAT_AFTER_MS);
  };
  useEffect(() => stop, []);
  return (
    <Pressable
      onPressIn={start}
      onPressOut={stop}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.nudgeBtn, pressed && styles.pressed]}
    >
      <Text style={styles.zoomText}>{label}</Text>
    </Pressable>
  );
}

export default function MapScreen() {
  const { t } = useI18n();
  const { connection, status } = useRobot();
  const url = connection.baseUrl;
  const inset = useSafeAreaInsets();
  const { width: w, height: h } = useWindowDimensions();

  const [info, setInfo] = useState<MapInfo | null>(null);
  const [version, setVersion] = useState(0);
  const [failed, setFailed] = useState(false);
  const [frame, setFrame] = useState({ x: 0, y: 0, w: 0, h: 0 }); // the map's frame on the screen
  const [navH, setNavH] = useState(48);
  // where the nav and each of its items sit, so a list opens under its own item
  const [navX, setNavX] = useState(0);
  const [itemX, setItemX] = useState<Partial<Record<string, number>>>({});
  // zoom and where the picture's corner is; for one map and frame size (another map or size starts from the whole map)
  const [zv, setZv] = useState<{
    key: string;
    zoom: number;
    offset: { x: number; y: number } | null;
  }>({ key: '', zoom: 1, offset: null });
  const [picked, setPicked] = useState<string | null>(null); // a marker's name
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null); // a tapped point, map frame
  const [positioning, setPositioning] = useState(false);
  const [control, setControl] = useState(false);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [aim, setAim] = useState<number | null>(null); // the heading dragged out while setting the position, rad
  const [scan, setScan] = useState<number[][] | null>(null); // the lidar now, around the base
  const [ask, setAsk] = useState<ConfirmRequest | null>(null);
  const [naming, setNaming] = useState(false);
  const [editing, setEditing] = useState<MapMarker | null>(null); // the marker in the edit dialog
  const [note, setNote] = useState<{ key: TextKey; bad?: boolean } | null>(null);

  const load = useCallback(() => {
    getMapInfo(url).then(
      (m) => {
        setInfo(m);
        setVersion(Date.now());
        setFailed(false);
      },
      () => setFailed(true),
    );
  }, [url]);
  useEffect(load, [load]);

  // a route: markers in the order picked, how long to wait at each, there and back
  const [stopsPicked, setStops] = useState<string[]>([]);
  const [pause, setPause] = useState(1);
  const [loop, setLoop] = useState(false);
  const [rounds, setRounds] = useState(0); // with loop; 0 = until stopped
  const [adding, setAdding] = useState(false); // the route's list of markers to add
  const [run, setRun] = useState<{
    by: 'api' | 'assistant';
    progress: RouteProgress | null;
  } | null>(null);
  const stops = info
    ? keepKnown(
        stopsPicked,
        info.markers.map((m) => m.name),
      )
    : stopsPicked;
  const numbers = stopNumbers(stops); // each marker's places in the route, p1 -> 1 4
  const runByApi = run?.by === 'api';
  useEffect(() => {
    if (!runByApi) return;
    let alive = true;
    const id = setInterval(() => {
      getRoute(url).then(
        (p) => {
          if (!alive || !p) return;
          if (p.phase === 'driving') return setRun((r) => r && { ...r, progress: p });
          setRun(null);
          setNote({
            key: p.phase === 'done' ? 'mapRouteDone' : p.phase === 'cancelled' ? 'mapRouteCancelled' : 'mapRouteFailed',
            bad: p.phase === 'failed',
          });
        },
        () => {},
      );
    }, ROUTE_EVERY_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [runByApi, url]);

  // setting the position: the lidar once a second, drawn at Lumi's place now (red) and at the new one (purple)
  useEffect(() => {
    if (!positioning) return;
    let alive = true;
    const read = () =>
      getScan(url).then(
        (p) => alive && setScan(p),
        () => alive && setScan(null),
      );
    read();
    const id = setInterval(read, SCAN_EVERY_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [positioning, url]);

  useEffect(() => {
    if (!note) return;
    const id = setTimeout(() => setNote(null), NOTE_MS);
    return () => clearTimeout(id);
  }, [note]);

  const fit = useMemo(() => (info ? fitMap(info.width, info.height, frame.w, frame.h) : null), [info, frame.w, frame.h]);
  const viewKey = info ? `${info.name}/${info.floor}/${frame.w}x${frame.h}` : '';
  const zoom = zv.key === viewKey ? zv.zoom : 1;
  const offset = (zv.key === viewKey && zv.offset) || {
    x: fit?.left ?? 0,
    y: fit?.top ?? 0,
  };
  const scale = (fit?.scale ?? 0) * zoom;
  const toView = (x: number, y: number) => {
    if (!info) return { x: 0, y: 0 };
    const p = worldToPixel(info, x, y);
    return { x: offset.x + p.x * scale, y: offset.y + p.y * scale };
  };
  const place = (z: number, off: { x: number; y: number }) => {
    if (!info || !fit) return;
    const zz = clampZoom(z);
    setZv({
      key: viewKey,
      zoom: zz,
      offset: clampOffset(off, info.width * fit.scale * zz, info.height * fit.scale * zz, frame.w, frame.h),
    });
  };
  const zoomBy = (k: number) => {
    Haptics.selectionAsync().catch(() => {});
    const z1 = clampZoom(zoom * k);
    place(z1, zoomAbout(offset, zoom, z1, frame.w / 2, frame.h / 2));
  };

  // one finger drags the map, two fingers pinch it; a touch that hardly moved is a tap
  // setting the position: one finger is not a drag of the map but the place (where it went down) and the heading
  const touch = useRef<{
    x: number;
    y: number;
    off: { x: number; y: number };
    zoom: number;
    d: number;
    moved: boolean;
    aimed?: boolean;
  } | null>(null);
  const down = useRef({ x: 0, y: 0 }); // where the last touch went down (a marker's tap is not taken by the frame)
  const spread = (e: GestureResponderEvent) => {
    const t = e.nativeEvent.touches;
    if (t.length < 2) return null;
    return {
      d: Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY),
      x: (t[0].pageX + t[1].pageX) / 2 - frame.x,
      y: (t[0].pageY + t[1].pageY) / 2 - frame.y,
    };
  };
  const onGrant = (e: GestureResponderEvent) => {
    const n = e.nativeEvent;
    touch.current = {
      x: n.pageX,
      y: n.pageY,
      off: offset,
      zoom,
      d: 0,
      moved: false,
    };
  };
  const onMove = (e: GestureResponderEvent) => {
    const t = touch.current;
    if (!t) return;
    const two = spread(e);
    if (two) {
      if (!t.d)
        Object.assign(t, {
          d: two.d,
          x: two.x + frame.x,
          y: two.y + frame.y,
          off: offset,
          zoom,
        });
      t.moved = true;
      const z1 = clampZoom((t.zoom * two.d) / t.d);
      const at = zoomAbout(t.off, t.zoom, z1, t.x - frame.x, t.y - frame.y);
      place(z1, {
        x: at.x + two.x - (t.x - frame.x),
        y: at.y + two.y - (t.y - frame.y),
      });
      return;
    }
    const n = e.nativeEvent;
    const dx = n.pageX - t.x;
    const dy = n.pageY - t.y;
    if (!t.moved && Math.hypot(dx, dy) < TAP_PX) return;
    t.moved = true;
    if (t.d) return;
    if (positioning) {
      if (!t.aimed) tap(t.x - frame.x, t.y - frame.y); // the place is where the finger went down
      t.aimed = true;
      setAim(headingFromDrag(dx, dy));
      return;
    }
    place(t.zoom, { x: t.off.x + dx, y: t.off.y + dy });
  };
  const onRelease = (e: GestureResponderEvent) => {
    const t = touch.current;
    touch.current = null;
    if (t && !t.moved) tap(e.nativeEvent.pageX - frame.x, e.nativeEvent.pageY - frame.y);
  };

  const done = (key: TextKey) => () => setNote({ key });
  const failedNote = (e: unknown) => setNote({ key: e instanceof BusyError ? 'busy' : 'noAnswer', bad: true });

  const tap = (vx: number, vy: number) => {
    if (!info || scale === 0) return;
    if (menu !== 'route') setMenu(null); // the route's panel stays while picking
    const px = (vx - offset.x) / scale;
    const py = (vy - offset.y) / scale;
    if (px < 0 || py < 0 || px > info.width || py > info.height) return;
    Haptics.selectionAsync().catch(() => {});
    setPicked(null);
    setAim(null);
    setPoint(pixelToWorld(info, px, py));
  };

  const heading = status?.pose?.theta ?? 0;
  const go = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const call = picked ? goMarker(url, picked) : point ? goPoint(url, point.x, point.y, heading) : null;
    call?.then(done('mapGoing'), failedNote);
  };
  const save = (name: string) => {
    setNaming(false);
    saveMarker(url, name, point ? { ...point, theta: heading } : undefined).then(() => {
      setNote({ key: 'mapSaved' });
      setPoint(null);
      setPicked(name);
      load();
    }, failedNote);
  };
  const setHere = () =>
    point &&
    setAsk({
      title: t('mapPositionAsk'),
      choices: [
        {
          text: t('mapSetPosition'),
          onPress: () =>
            setPosition(url, point.x, point.y, aim ?? heading).then(() => {
              setNote({ key: 'mapPositionSet' });
              setPositioning(false);
              setPoint(null);
              setAim(null);
            }, failedNote),
        },
      ],
    });
  const rename = (m: MapMarker, name: string) => {
    setEditing(null);
    // the base has no rename: the marker is saved again under the new name, then the old one goes
    saveMarker(url, name, { x: m.x, y: m.y, theta: m.theta }, m.dock)
      .then(() => deleteMarker(url, m.name))
      .then(() => {
        setNote({ key: 'mapRenamed' });
        if (picked === m.name) setPicked(name);
        load();
      }, failedNote);
  };
  const moveHere = (m: MapMarker) => {
    setEditing(null);
    saveMarker(url, m.name, undefined, m.dock).then(() => {
      setNote({ key: 'mapMoved' });
      load();
    }, failedNote);
  };
  const remove = (name: string, charger = false) =>
    setAsk({
      title: charger ? `${t('mapDeleteChargerAsk')} ${name}?` : `${t('mapDeleteAsk')} ${name}`,
      choices: [
        {
          text: t('delete'),
          destructive: true,
          onPress: () =>
            deleteMarker(url, name).then(() => {
              setNote({ key: 'mapDeleted' });
              if (picked === name) setPicked(null);
              load();
            }, failedNote),
        },
      ],
    });
  const switchTo = (name: string, floor: number) =>
    setAsk({
      title: `${t('mapSwitchAsk')} ${name}`,
      choices: [
        {
          text: t('mapMaps'),
          onPress: () => {
            setMenu(null);
            switchMap(url, name, floor).then(() => {
              setNote({ key: 'mapSwitched' });
              setPicked(null);
              setPoint(null);
              setTimeout(load, SWITCH_WAIT_MS);
            }, failedNote);
          },
        },
      ],
    });

  const beginRoute = () => {
    if (!stops.length) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setMenu(null);
    setPicked(null);
    setPoint(null);
    if (stops.length === 1 && !loop) return goMarker(url, stops[0]).then(done('mapGoing'), failedNote); // as the old dashboard
    startRoute(url, stops, { pause, loop, rounds }).then(
      (by) => {
        setRun({ by, progress: null });
        setNote({
          key: by === 'assistant' ? 'mapRouteByAssistant' : 'mapRouteStarted',
        });
      },
      (e) => (e instanceof BusyError && loop ? setNote({ key: 'mapRouteLoopNeeds', bad: true }) : failedNote(e)),
    );
  };
  const endRoute = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    cancelDrive(url).then(() => {
      setRun(null);
      setNote({ key: 'mapRouteCancelled' });
    }, failedNote);
  };

  const press = (item: (typeof ITEMS)[number]) => {
    Haptics.selectionAsync().catch(() => {});
    if (item.soon) return setNote({ key: 'soon' });
    if (item.list) return setMenu((m) => (m === item.key ? null : (item.key as Menu)));
    setMenu(null);
    if (item.key === 'position') return startPositioning(!positioning);
    if (item.key === 'control') {
      if (positioning) startPositioning(false);
      setControl((c) => !c);
    }
  };
  const startPositioning = (on: boolean) => {
    setMenu(null);
    setPositioning(on);
    setPicked(null);
    if (on) setControl(false); // the arrows sit where the joystick would
    // as on the base's own page: the new place starts where the base thinks it is, then it is moved onto the walls
    setPoint(on && status?.pose ? { x: status.pose.x, y: status.pose.y } : null);
    setAim(on && status?.pose ? status.pose.theta : null);
    if (on) setNote({ key: 'mapPositionHint' });
    else setScan(null);
  };
  const nudge = (dx: number, dy: number) => {
    Haptics.selectionAsync().catch(() => {});
    setPoint((p) => (p ? { x: p.x + dx, y: p.y + dy } : p));
  };
  const turn = (d: number) => {
    Haptics.selectionAsync().catch(() => {});
    setAim((a) => (a ?? heading) + d);
  };

  const lumi = status?.pose && info ? toView(status.pose.x, status.pose.y) : null;
  const size = info ? footprintPx(info.resolution, scale) : 0; // Lumi's 510 mm base on screen, markers the same
  const target = picked ?? (point ? t('mapPoint') : null);
  const navTop = 14 + inset.top + Math.max(44, 0.075 * h);

  // the route's panel: the map's top left corner, open while ROUTE is
  const routeTop = navTop + navH + 22;
  const toggleRoute = () => {
    Haptics.selectionAsync().catch(() => {});
    setMenu((m) => (m === 'route' ? null : 'route'));
  };
  // closed: a pill in the map's top left corner (the nav's look); open: a card in the same corner
  const routePanel =
    !info || positioning ? null : menu !== 'route' ? (
      <Pressable
        onPress={toggleRoute}
        accessibilityRole="button"
        accessibilityLabel={t('mapRoute')}
        style={({ pressed }) => [
          styles.routePill,
          { top: routeTop, left: 36 + inset.left },
          run && styles.routePillRun,
          pressed && styles.pressed,
        ]}
      >
        <Icon item="route" color={mono.yellow} />
        <Text style={[styles.itemText, styles.routePillText]}>{t('mapRoute')}</Text>
        {stops.length > 0 && <Text style={styles.routeCount}>{stops.length}</Text>}
        <Chevron color={mono.yellow} />
      </Pressable>
    ) : (
      <View
        style={[
          styles.route,
          {
            top: routeTop,
            left: 36 + inset.left,
            maxHeight: h - routeTop - (18 + inset.bottom + DOCK_SPACE + 76),
          },
        ]}
      >
        <Pressable
          onPress={toggleRoute}
          accessibilityRole="button"
          accessibilityLabel={t('cancel')}
          style={({ pressed }) => [styles.routeHead, pressed && styles.pressed]}
        >
          <Icon item="route" color={mono.yellow} />
          <Text style={[styles.itemText, styles.routeTitle]}>{t('mapRoute')}</Text>
          <View style={styles.routeClose}>
            <Cross color={mono.text} size={11} />
          </View>
        </Pressable>
        {stops.length > 0 && (
          <ScrollView style={styles.stopList} nestedScrollEnabled>
            {stops.map((n, i) => (
              <View key={`${i}-${n}`} style={styles.stopRow}>
                <Text style={styles.stopNum}>{i + 1}</Text>
                <Text style={styles.stopName} numberOfLines={1}>
                  {info.markers.find((m) => m.name === n)?.dock ? '⌂ ' : ''}
                  {n}
                </Text>
                <Pressable
                  onPress={() => setStops(removeStopAt(stops, i))}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('delete')} ${n}`}
                  style={({ pressed }) => pressed && styles.pressed}
                >
                  <Cross color={mono.dim} size={11} />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        )}
        <Pressable
          onPress={() => setAdding((v) => !v)}
          style={({ pressed }) => [styles.addStop, adding && styles.addStopOn, pressed && styles.pressed]}
        >
          <Text style={styles.addStopText}>+ {t('mapRouteAdd')}</Text>
          <Chevron up={adding} />
        </Pressable>
        {adding && (
          <ScrollView style={styles.addList} nestedScrollEnabled>
            {info.markers.map((m) => {
              const last = stops[stops.length - 1] === m.name; // not twice in a row: Lumi is there already
              return (
                <Pressable
                  key={m.name}
                  disabled={last}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setStops(addStop(stops, m.name));
                  }}
                  style={({ pressed }) => [styles.addRow, last && styles.btnOff, pressed && styles.pressed]}
                >
                  <Text style={styles.rowText}>
                    {m.dock ? '⌂ ' : ''}
                    {m.name}
                  </Text>
                  {(numbers.get(m.name) ?? []).length > 0 && <Text style={styles.addRowNums}>{numbers.get(m.name)?.join(' ')}</Text>}
                </Pressable>
              );
            })}
          </ScrollView>
        )}
        <View style={styles.sep} />
        <Stepper
          label={t('mapRoutePause')}
          value={`${pause} ${t('seconds')}`}
          onMinus={() => setPause((v) => Math.max(0, v - 1))}
          onPlus={() => setPause((v) => Math.min(PAUSE_MAX_S, v + 1))}
        />
        <Pressable onPress={() => setLoop((v) => !v)} style={({ pressed }) => [styles.setting, pressed && styles.pressed]}>
          <Text style={styles.rowText}>{t('mapRouteLoop')}</Text>
          <View style={[styles.switch, loop && styles.switchOn]}>
            <View style={[styles.knob, loop && styles.knobOn]} />
          </View>
        </Pressable>
        {loop && (
          <Stepper
            label={t('mapRouteTimes')}
            value={String(rounds)}
            onMinus={() => setRounds((v) => Math.max(0, v - 1))}
            onPlus={() => setRounds((v) => Math.min(ROUNDS_MAX, v + 1))}
          />
        )}
        <View style={styles.routeButtons}>
          <Pressable
            onPress={() => setStops([])}
            disabled={!stops.length}
            style={({ pressed }) => [styles.btn, styles.btnQuiet, !stops.length && styles.btnOff, pressed && styles.pressed]}
          >
            <Text style={styles.btnText}>{t('mapRouteClear')}</Text>
          </Pressable>
          <Pressable
            onPress={beginRoute}
            disabled={!stops.length}
            style={({ pressed }) => [
              styles.btn,
              styles.btnGo,
              styles.routeStart,
              !stops.length && styles.btnOff,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.btnText, styles.btnGoText]}>{t('mapRouteStart')}</Text>
          </Pressable>
        </View>
      </View>
    );

  let list: ReactNode = null;
  if (menu === 'markers' && info) {
    list = (
      <>
        <Pressable
          onPress={() => {
            setMenu(null);
            setPoint(null);
            setNaming(true);
          }}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        >
          <Text style={[styles.rowText, styles.rowAdd]}>+ {t('mapSaveHere')}</Text>
        </Pressable>
        <View style={styles.sep} />
        {info.markers.map((m) => (
          <Pressable
            key={m.name}
            onPress={() => {
              setPicked(m.name);
              setPoint(null);
              setMenu(null);
            }}
            style={({ pressed }) => [styles.row, picked === m.name && styles.rowOn, pressed && styles.pressed]}
          >
            <Text style={[styles.rowText, picked === m.name && styles.rowTextOn]}>
              {m.dock ? '⌂ ' : ''}
              {m.name}
            </Text>
            <Pressable
              onPress={() => {
                setMenu(null);
                setEditing(m);
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`${t('mapEditMarker')} ${m.name}`}
              style={({ pressed }) => pressed && styles.pressed}
            >
              <Pencil />
            </Pressable>
          </Pressable>
        ))}
      </>
    );
  } else if (menu === 'maps' && info) {
    list = info.maps.map((m) => {
      const on = m.name === info.name && m.floor === info.floor;
      return (
        <Pressable
          key={`${m.name}/${m.floor}`}
          onPress={() => !on && switchTo(m.name, m.floor)}
          style={({ pressed }) => [styles.row, on && styles.rowOn, pressed && styles.pressed]}
        >
          <Text style={[styles.rowText, on && styles.rowTextOn]}>{m.name}</Text>
          {on && <Text style={styles.rowGo}>●</Text>}
        </Pressable>
      );
    });
  }

  return (
    <View style={styles.root}>
      <View
        style={[styles.frame, { top: navTop + navH + 10, bottom: 18 + inset.bottom + DOCK_SPACE }]}
        onLayout={(e: LayoutChangeEvent) => {
          const l = e.nativeEvent.layout;
          setFrame({ x: l.x, y: l.y, w: l.width, h: l.height });
        }}
        onTouchStart={(e) => (down.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY })}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={(e) =>
          e.nativeEvent.touches.length > 1 ||
          Math.hypot(e.nativeEvent.pageX - down.current.x, e.nativeEvent.pageY - down.current.y) > TAP_PX
        }
        onResponderTerminationRequest={() => false}
        onResponderGrant={onGrant}
        onResponderMove={onMove}
        onResponderRelease={onRelease}
        onResponderTerminate={() => (touch.current = null)}
      >
        {info && scale > 0 && (
          <Image
            source={{ uri: mapImageUrl(url, info, version) }}
            style={{
              position: 'absolute',
              left: offset.x,
              top: offset.y,
              width: info.width * scale,
              height: info.height * scale,
            }}
            resizeMode="stretch"
            onError={() => setFailed(true)}
          />
        )}
        {info && scale > 0 && info.lines.length > 0 && (
          <Svg width={frame.w} height={frame.h} style={StyleSheet.absoluteFill} pointerEvents="none">
            {info.lines.map((l) => (
              <Path
                key={l.name}
                d={l.points.map((q, i) => `${i ? 'L' : 'M'}${toView(q.x, q.y).x} ${toView(q.x, q.y).y}`).join(' ')}
                stroke={mono.red}
                strokeOpacity={0.85}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            ))}
          </Svg>
        )}
        {info?.markers.map((m) => {
          const p = toView(m.x, m.y);
          const on = picked === m.name;
          const stroke = on ? mono.red : m.dock ? mono.blue : '#8a8a8a';
          return (
            <View key={m.name} style={StyleSheet.absoluteFill} pointerEvents="box-none">
              <Pressable
                onPress={() => {
                  if (menu === 'route') {
                    Haptics.selectionAsync().catch(() => {});
                    return setStops(addStop(stops, m.name)); // picking a route: the map's markers too
                  }
                  setPicked(m.name);
                  setPoint(null);
                  setMenu(null);
                }}
                hitSlop={Math.max(0, (24 - size) / 2)}
                style={{
                  position: 'absolute',
                  left: p.x - size / 2,
                  top: p.y - size / 2,
                  width: size,
                  height: size,
                  transform: [{ rotate: `${-m.theta}rad` }],
                }}
              >
                <Footprint size={size} stroke={stroke} fill="none" outline={false} />
              </Pressable>
              <View pointerEvents="none" style={[styles.label, { left: p.x - 60, top: p.y - Math.max(size / 2, 6) - 17 }]}>
                <Text style={[styles.markerText, on && styles.markerTextOn]}>{m.name}</Text>
              </View>
            </View>
          );
        })}
        {positioning && scan && info && (
          <Svg width={frame.w} height={frame.h} style={StyleSheet.absoluteFill} pointerEvents="none">
            {status?.pose &&
              scanToWorld(scan, status.pose).map((w, i) => {
                const v = toView(w.x, w.y);
                return <Circle key={`r${i}`} cx={v.x} cy={v.y} r={1.6} fill={mono.red} />;
              })}
            {point &&
              scanToWorld(scan, { ...point, theta: aim ?? heading }).map((w, i) => {
                const v = toView(w.x, w.y);
                return <Circle key={`p${i}`} cx={v.x} cy={v.y} r={1.8} fill={PURPLE} />;
              })}
          </Svg>
        )}
        {point && !positioning && (
          <View
            pointerEvents="none"
            style={[
              styles.ghost,
              {
                left: toView(point.x, point.y).x,
                top: toView(point.x, point.y).y,
              },
            ]}
          />
        )}
        {point && positioning && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: toView(point.x, point.y).x - Math.max(size, GHOST_MIN) / 2,
              top: toView(point.x, point.y).y - Math.max(size, GHOST_MIN) / 2,
              transform: [{ rotate: `${-(aim ?? heading)}rad` }],
            }}
          >
            <Footprint size={Math.max(size, GHOST_MIN)} stroke={PURPLE} fill="rgba(180,108,255,0.3)" />
          </View>
        )}
        {point && positioning && (
          <View
            pointerEvents="none"
            style={[
              styles.aim,
              {
                left: toView(point.x, point.y).x,
                top: toView(point.x, point.y).y,
                transform: [{ rotate: `${-(aim ?? heading)}rad` }],
              },
            ]}
          >
            <Svg width={56} height={20} viewBox="0 0 56 20">
              <Path d="M28 10 L52 10 M45 4 L52 10 L45 16" stroke={PURPLE} strokeWidth={2.5} fill="none" strokeLinecap="round" />
            </Svg>
          </View>
        )}
        {info && scale > 0 && stops.length > 0 && (menu === 'route' || run) && (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <Svg width={frame.w} height={frame.h} style={StyleSheet.absoluteFill}>
              <Path
                d={stops
                  .map((n, i) => {
                    const m = info.markers.find((k) => k.name === n);
                    const v = m ? toView(m.x, m.y) : { x: 0, y: 0 };
                    return `${i ? 'L' : 'M'}${v.x} ${v.y}`;
                  })
                  .join(' ')}
                stroke={mono.yellow}
                strokeWidth={2}
                strokeDasharray="6 5"
                fill="none"
              />
            </Svg>
            {[...numbers].map(([n, nums]) => {
              const m = info.markers.find((k) => k.name === n);
              if (!m) return null;
              const v = toView(m.x, m.y);
              const on = run?.progress != null && run.progress.stops[run.progress.index] === n;
              return (
                <View key={n} style={[styles.stopDot, on && styles.stopDotOn, { left: v.x + 6, top: v.y - 22 }]}>
                  <Text style={styles.stopText}>{nums.join(' ')}</Text>
                </View>
              );
            })}
          </View>
        )}
        {lumi && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: lumi.x - size / 2,
              top: lumi.y - size / 2,
              transform: [{ rotate: `${-heading}rad` }],
            }}
          >
            <Footprint size={size} stroke={mono.green} fill="rgba(61,255,139,0.28)" />
          </View>
        )}
        {!info && <Text style={styles.center}>{t(failed ? 'mapNoMap' : 'mapLoading')}</Text>}
      </View>

      {info && (
        <View style={[styles.zoom, { top: navTop + navH + 22 }]}>
          <Pressable
            onPress={() => zoomBy(ZOOM_STEP)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="+"
            style={({ pressed }) => [styles.zoomBtn, pressed && styles.pressed]}
          >
            <Text style={styles.zoomText}>+</Text>
          </Pressable>
          <View style={styles.zoomSep} />
          <Pressable
            onPress={() => zoomBy(1 / ZOOM_STEP)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="-"
            style={({ pressed }) => [styles.zoomBtn, pressed && styles.pressed]}
          >
            <Text style={styles.zoomText}>−</Text>
          </Pressable>
        </View>
      )}
      {positioning && point && (
        <View
          style={[
            styles.nudge,
            {
              right: 36 + inset.right,
              bottom: 18 + inset.bottom + DOCK_SPACE + 12,
            },
          ]}
        >
          <Text style={styles.nudgeHint}>{t('mapAlignHint')}</Text>
          <View style={styles.nudgeRow}>
            <NudgeButton label="⟲" onPress={() => turn(TURN_RAD)} />
            <NudgeButton label="↑" onPress={() => nudge(0, NUDGE_M)} />
            <NudgeButton label="⟳" onPress={() => turn(-TURN_RAD)} />
          </View>
          <View style={styles.nudgeRow}>
            <NudgeButton label="←" onPress={() => nudge(-NUDGE_M, 0)} />
            <NudgeButton label="↓" onPress={() => nudge(0, -NUDGE_M)} />
            <NudgeButton label="→" onPress={() => nudge(NUDGE_M, 0)} />
          </View>
        </View>
      )}
      <View style={[styles.navWrap, { top: navTop }]} pointerEvents="box-none">
        <View
          style={styles.nav}
          onLayout={(e: LayoutChangeEvent) => {
            setNavH(e.nativeEvent.layout.height);
            setNavX(e.nativeEvent.layout.x);
          }}
        >
          {ITEMS.map((item) => {
            const on = (item.key === 'control' && control) || (item.key === 'position' && positioning) || menu === item.key;
            const color = item.soon ? mono.dim : on ? mono.text : mono.soft;
            return (
              <Pressable
                key={item.key}
                onPress={() => press(item)}
                onLayout={(e: LayoutChangeEvent) => {
                  const x = e.nativeEvent.layout.x;
                  setItemX((m) => (m[item.key] === x ? m : { ...m, [item.key]: x }));
                }}
                hitSlop={4}
                accessibilityRole="button"
                accessibilityState={{ selected: on, disabled: item.soon }}
                style={({ pressed }) => [styles.item, on && styles.itemOn, pressed && styles.pressed]}
              >
                <Icon item={item.key} color={color} />
                <Text style={[styles.itemText, { color }]}>{t(item.label)}</Text>
                {item.list && <Chevron up={menu === item.key} color={color} size={11} />}
              </Pressable>
            );
          })}
        </View>
        {note && <Text style={[styles.note, note.bad && styles.noteBad]}>{t(note.key)}</Text>}
      </View>

      {routePanel}
      {list && (
        <ScrollView
          style={[
            styles.list,
            {
              top: navTop + navH + 8,
              left: Math.max(12, Math.min(navX + (itemX[menu ?? ''] ?? 0), w - LIST_W - 12)),
            },
          ]}
          contentContainerStyle={{ padding: 6 }}
        >
          {list}
        </ScrollView>
      )}

      {run && !positioning && (
        <View style={[styles.bar, { bottom: 18 + inset.bottom + DOCK_SPACE + 14 }]}>
          <Text style={styles.barTarget}>
            {t('mapRoute')}
            {run.progress ? `  ${run.progress.index + 1}/${run.progress.stops.length}  ${run.progress.stops[run.progress.index]}` : ''}
          </Text>
          <Pressable onPress={endRoute} style={({ pressed }) => [styles.btn, styles.btnStop, pressed && styles.pressed]}>
            <Text style={[styles.btnText, styles.btnStopText]}>{t('cancel')}</Text>
          </Pressable>
        </View>
      )}
      {!run && (target || positioning) && (
        <View style={[styles.bar, { bottom: 18 + inset.bottom + DOCK_SPACE + 14 }]}>
          {target && !positioning && <Text style={styles.barTarget}>{target}</Text>}
          {positioning ? (
            <>
              <Pressable
                onPress={() => startPositioning(false)}
                style={({ pressed }) => [styles.btn, styles.btnQuiet, pressed && styles.pressed]}
              >
                <Text style={styles.btnText}>{t('cancel')}</Text>
              </Pressable>
              <Pressable
                onPress={setHere}
                disabled={!point}
                style={({ pressed }) => [styles.btn, styles.btnGo, !point && styles.btnOff, pressed && styles.pressed]}
              >
                <Text style={[styles.btnText, styles.btnGoText]}>{t('mapSave')}</Text>
              </Pressable>
            </>
          ) : (
            <>
              {point && (
                <Pressable onPress={() => setNaming(true)} style={({ pressed }) => [styles.btn, pressed && styles.pressed]}>
                  <Text style={styles.btnText}>{t('mapSave')}</Text>
                </Pressable>
              )}
              <Pressable onPress={go} style={({ pressed }) => [styles.btn, styles.btnGo, pressed && styles.pressed]}>
                <Text style={[styles.btnText, styles.btnGoText]}>{t('mapGo')}</Text>
              </Pressable>
            </>
          )}
        </View>
      )}

      {control && <Joystick />}
      <MarkerDialog
        marker={editing}
        names={info?.markers.map((m) => m.name) ?? []}
        onRename={(name) => editing && rename(editing, name)}
        onMoveHere={() => editing && moveHere(editing)}
        onDelete={() => {
          if (!editing) return;
          setEditing(null);
          remove(editing.name, editing.dock);
        }}
        onClose={() => setEditing(null)}
      />
      <ConfirmDialog request={ask} onClose={() => setAsk(null)} />
      <NameDialog
        open={naming}
        title="mapMarkerName"
        rule="mapNameRule"
        initial={nextMarkerName(info?.markers.map((m) => m.name) ?? [])}
        valid={validMarkerName}
        onDone={save}
        onClose={() => setNaming(false)}
      />
    </View>
  );
}

const LIST_W = 260;
const GHOST_MIN = 22; // the purple Lumi stays big enough to see when the map is zoomed out
const glass = {
  backgroundColor: 'rgba(8,8,8,0.92)',
  borderWidth: 1,
  borderColor: '#333',
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  frame: {
    position: 'absolute',
    left: 24,
    right: 24,
    overflow: 'hidden',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    backgroundColor: '#07080a',
  },
  center: {
    position: 'absolute',
    alignSelf: 'center',
    top: '48%',
    fontFamily: fonts.mono,
    color: mono.soft,
  },
  zoom: {
    position: 'absolute',
    right: 36,
    borderRadius: 14,
    overflow: 'hidden',
    ...{
      backgroundColor: 'rgba(8,8,8,0.92)',
      borderWidth: 1,
      borderColor: '#333',
    },
  },
  zoomBtn: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomText: {
    fontFamily: fonts.monoBold,
    fontSize: 20,
    color: mono.text,
    lineHeight: 24,
  },
  zoomSep: { height: 1, backgroundColor: '#333' },
  nudge: {
    position: 'absolute',
    padding: 8,
    gap: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(8,8,8,0.92)',
    borderWidth: 1,
    borderColor: '#333',
  },
  nudgeHint: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: PURPLE,
    textAlign: 'center',
  },
  nudgeRow: { flexDirection: 'row', gap: 6, justifyContent: 'center' },
  nudgeBtn: {
    width: 44,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#444',
  },
  label: { position: 'absolute', width: 120, alignItems: 'center' },
  markerText: {
    fontFamily: fonts.monoBold,
    fontSize: 11,
    color: '#a9a9a9',
    paddingHorizontal: 4,
    borderRadius: 4,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowRadius: 4,
  },
  markerTextOn: { color: '#fff', backgroundColor: 'rgba(255,45,45,0.85)' },
  ghost: {
    position: 'absolute',
    width: 16,
    height: 16,
    marginLeft: -8,
    marginTop: -8,
    borderRadius: 8,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: mono.yellow,
  },
  navWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 8,
  },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    padding: 5,
    borderRadius: 999,
    ...glass,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
  },
  itemOn: { backgroundColor: 'rgba(255,255,255,0.09)' },
  itemText: {
    fontFamily: fonts.monoBold,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  list: {
    position: 'absolute',
    maxHeight: 300,
    width: LIST_W,
    borderRadius: 14,
    ...glass,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  rowOn: { backgroundColor: 'rgba(255,255,255,0.07)' },
  rowText: { fontFamily: fonts.mono, fontSize: 12, color: '#cfcfcf' },
  rowTextOn: { color: mono.red, fontFamily: fonts.monoBold },
  rowGo: { fontFamily: fonts.monoBold, fontSize: 11, color: mono.green },
  rowAdd: { color: mono.green, fontFamily: fonts.monoBold },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepBtn: {
    width: 30,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValue: {
    fontFamily: fonts.monoBold,
    fontSize: 12,
    color: mono.text,
    minWidth: 64,
    textAlign: 'center',
  },
  switch: {
    width: 36,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#555',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  switchOn: {
    borderColor: mono.green,
    backgroundColor: 'rgba(61,255,139,0.15)',
  },
  knob: { width: 14, height: 14, borderRadius: 7, backgroundColor: mono.soft },
  knobOn: { backgroundColor: mono.green, alignSelf: 'flex-end' },
  // a button (the nav's look, a step brighter), not one more label on the map
  routePill: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 999,
    backgroundColor: 'rgba(30,26,12,0.96)', // the route's yellow, as its path on the map
    borderWidth: 1.5,
    borderColor: 'rgba(255,207,51,0.6)',
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  routePillRun: { borderColor: mono.green },
  routePillText: { color: mono.yellow, fontSize: 12 },
  routeCount: {
    fontFamily: fonts.monoBold,
    fontSize: 11,
    color: '#000',
    backgroundColor: mono.yellow,
    borderRadius: 9,
    minWidth: 18,
    textAlign: 'center',
    paddingHorizontal: 4,
    overflow: 'hidden',
  },
  route: {
    position: 'absolute',
    width: 270,
    borderRadius: 14,
    padding: 10,
    gap: 8,
    ...glass,
  },
  // the panel's close: a round button, unlike the small crosses that take out a stop
  routeClose: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#555',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  routeHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
    paddingVertical: 3,
  },
  routeTitle: { flex: 1, color: mono.text },
  stopList: { flexGrow: 0, maxHeight: 4 * 34 + 2 }, // about four stops, then it scrolls
  stopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    marginBottom: 4,
  },
  stopNum: {
    fontFamily: fonts.monoBold,
    fontSize: 11,
    color: mono.soft,
    width: 14,
    textAlign: 'center',
  },
  stopName: { flex: 1, fontFamily: fonts.mono, fontSize: 12, color: mono.text },
  addStop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
    borderStyle: 'dashed',
  },
  addStopOn: { borderStyle: 'solid', borderColor: '#555' },
  addStopText: { fontFamily: fonts.mono, fontSize: 12, color: mono.soft },
  addList: {
    flexGrow: 0,
    maxHeight: 5 * 31,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2c2c2c',
  },
  addRowNums: { fontFamily: fonts.monoBold, fontSize: 10, color: mono.soft },
  addRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 7 },
  setting: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 2,
  },
  routeButtons: { flexDirection: 'row', gap: 8, marginTop: 2 },
  routeStart: { flex: 1, alignItems: 'center' },
  stopDot: {
    position: 'absolute',
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: mono.yellow,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  stopDotOn: { backgroundColor: mono.green },
  stopText: { fontFamily: fonts.monoBold, fontSize: 11, color: '#000' },
  sep: { height: 1, backgroundColor: '#333', marginVertical: 4 },
  listTitle: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.5,
    color: mono.soft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    textTransform: 'uppercase',
  },
  aim: {
    position: 'absolute',
    width: 56,
    height: 20,
    marginLeft: -28,
    marginTop: -10,
  },
  note: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: mono.text,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    overflow: 'hidden',
    ...glass,
  },
  noteBad: { color: mono.yellow },
  bar: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 6,
    borderRadius: 999,
    ...glass,
  },
  barTarget: {
    fontFamily: fonts.monoBold,
    fontSize: 12,
    color: mono.text,
    paddingHorizontal: 10,
  },
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: mono.text,
  },
  btnOff: { opacity: 0.4 },
  btnQuiet: { borderColor: '#555' },
  btnGo: { borderColor: mono.green },
  btnText: {
    fontFamily: fonts.monoBold,
    fontSize: 11,
    letterSpacing: 1.2,
    color: mono.text,
    textTransform: 'uppercase',
  },
  btnGoText: { color: mono.green },
  btnStop: { borderColor: mono.red },
  btnStopText: { color: mono.red },
  pressed: { opacity: 0.6 },
});
