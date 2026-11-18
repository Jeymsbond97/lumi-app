// The Map screen (owner's pick A2, 2026-11-16): the base's map in the middle with Lumi's live place and heading and the
// markers; a floating navbar on top (CONTROL, MARKERS, ROUTE, POSITION, MAPPING, MAPS, SETTINGS) with drop-down lists;
// a small bar at the bottom for what is picked (a marker or a tapped point): SAVE and GO, or SET POSITION.
// MAPPING makes a new map: a name, then the growing map with Lumi on it, the joystick, SAVE or STOP (docs/MAP.md).
// VIEW and BASE are the base page's top bar (follow, laser, trail, planned path; state, sensors): src/ui/MapPanels.
// SETTINGS: four of the base page's configuration settings (src/ui/BaseSettingsList.tsx).
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
  deleteLine,
  deleteMarker,
  getMapInfo,
  getPlan,
  getRoute,
  getSensors,
  getScan,
  getScanPicture,
  getScanState,
  goMarker,
  goPoint,
  mapImageUrl,
  NeedsUpdateError,
  saveLine,
  saveMarker,
  saveScan,
  setPosition,
  startRoute,
  startScan,
  switchMap,
} from '../../lib/api';
import { keepPicture, progressText, saveEarly, validNewMapName, type ScanPicture, type ScanState } from '../../lib/mapping';
import { addStop, keepKnown, PAUSE_MAX_S, removeStopAt, ROUNDS_MAX, stopNumbers, type RouteProgress } from '../../lib/route';
import { addToTrail, driving, trailLength, type Sensors, type Trail } from '../../lib/baseInfo';
import {
  centreOn,
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
import { BaseSettingsList } from '../../ui/BaseSettingsList';
import { BaseList, MapLayers, ViewList, type Layer } from '../../ui/MapPanels';
import { MarkerDialog } from '../../ui/MarkerDialog';
import { NameDialog } from '../../ui/NameDialog';
import { colors, fonts, mono } from '../../ui/theme';

const NOTE_MS = 2500;
const SWITCH_EVERY_MS = 2000; // after a switch: /map/info this often until it names the new map
const SWITCH_GIVE_UP_MS = 90000; // the base restarts with the other map; it has always been back well before this
const ZOOM_STEP = 1.5; // one press of + or -
const TAP_PX = 8; // a touch that moved less than this is a tap (picks a point), more is a drag (moves the map)
const DOCK_SPACE = 64; // room the sections dock takes at the bottom, above the safe area
const SCAN_EVERY_MS = 1000; // the lidar while setting the position
const NUDGE_M = 0.05; // one press of an arrow while setting the position
const TURN_RAD = (2 * Math.PI) / 180; // one press of a turn
const REPEAT_AFTER_MS = 400; // an arrow held this long starts repeating
const REPEAT_MS = 90; // then one step this often
const GRAB_PX = 22; // a finger this close to a drawn point moves it
const ROUTE_EVERY_MS = 1000; // a route's progress while the API drives it
const MAPPING_STATE_MS = 1000; // making a new map: Lumi's pose and the optimizing progress
const MAPPING_PICTURE_MS = 1500; // and the growing map (the base draws it about once a second)
const SAVED_RELOAD_MS = 3000; // the new map shows in MAPS a moment after it is saved
const SENSORS_EVERY_MS = 1000; // BASE open: speed, ultrasonic and infrared
const PLAN_EVERY_MS = 1000; // VIEW planned path on: the base's path while it drives
const TRAIL_EVERY_MS = 1000; // the trail takes Lumi's pose this often (the robot is asked once a second)

type Item = 'control' | 'markers' | 'lines' | 'route' | 'position' | 'mapping' | 'maps' | 'view' | 'base' | 'settings';
type Menu = 'markers' | 'lines' | 'maps' | 'route' | 'view' | 'base' | 'settings';
const ITEMS: { key: Item; label: TextKey; list?: boolean; soon?: boolean }[] = [
  { key: 'control', label: 'mapControl' },
  { key: 'markers', label: 'mapMarkers', list: true },
  { key: 'lines', label: 'mapLines', list: true },
  { key: 'position', label: 'mapPosition' },
  { key: 'mapping', label: 'mapMapping' },
  { key: 'maps', label: 'mapMaps', list: true },
  { key: 'view', label: 'mapView', list: true },
  { key: 'base', label: 'mapBase', list: true },
  { key: 'settings', label: 'mapSettings', list: true },
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
      {item === 'lines' && (
        <>
          <Circle cx={12} cy={12} r={9} {...p} />
          <Path d="M5.6 18.4L18.4 5.6" {...p} />
        </>
      )}
      {item === 'mapping' && <Path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15" {...p} />}
      {item === 'maps' && (
        <>
          <Rect x={3} y={4} width={18} height={16} rx={2} {...p} />
          <Path d="M3 10h18" {...p} />
        </>
      )}
      {item === 'view' && (
        <>
          <Path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" {...p} />
          <Circle cx={12} cy={12} r={3} {...p} />
        </>
      )}
      {item === 'base' && <Path d="M3 12h4l2.5-6 5 12 2.5-6h4" {...p} />}
      {item === 'settings' && (
        <>
          <Circle cx={12} cy={12} r={3} {...p} />
          <Path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" {...p} />
        </>
      )}
    </Svg>
  );
}

/** Markers and Lumi are drawn at least this big (px), however far the map is zoomed out. */
const MARKER_MIN = 16;
const LUMI_MIN = 24;

/** A marker like on the base's own page (:9001): a filled triangle pointing to its heading (+x), dark edged. */
function MarkerMark({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path d="M90 50 L18 16 L30 50 L18 84 Z" fill={color} stroke="#000" strokeWidth={7} strokeLinejoin="round" />
    </Svg>
  );
}

/** Lumi's base on the map like on :9001: a thin rounded square with a filled triangle to its front (+x of the pose). */
function Footprint({ size, stroke, fill }: { size: number; stroke: string; fill: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Rect x={4} y={4} width={92} height={92} rx={22} stroke={stroke} strokeWidth={size < 30 ? 8 : 5} fill={fill} />
      <Path d="M78 50 L30 26 L38 50 L30 74 Z" fill={stroke} stroke="#000" strokeWidth={5} strokeLinejoin="round" />
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

const PIN_W = 26;
const PIN_H = 34;
/** The tapped point: a yellow pin whose tip is the point, with a ring on the ground. */
function PointPin() {
  return (
    <Svg width={PIN_W} height={PIN_H + 5} viewBox="0 0 26 39">
      <Circle cx={13} cy={34} r={4.5} fill="none" stroke={mono.yellow} strokeOpacity={0.5} strokeWidth={1.5} />
      <Path d="M13 34C13 34 3 21.5 3 13a10 10 0 0 1 20 0c0 8.5-10 21-10 21z" fill={mono.yellow} stroke="#1a1400" strokeWidth={1.5} />
      <Circle cx={13} cy={13} r={4} fill="#1a1400" />
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

  const [mapInfo, setInfo] = useState<MapInfo | null>(null); // the base's current map
  // making a new map: what the base says about it, the picture shown and the next one (shown once it has loaded)
  const [scanning, setScanning] = useState<ScanState | null>(null);
  const [scanPic, setScanPic] = useState<ScanPicture | null>(null);
  const [nextPic, setNextPic] = useState<ScanPicture | null>(null);
  const [scanBusy, setScanBusy] = useState(false); // saving or cancelling: the base answers when it is done
  // while mapping the screen shows the new map instead (no markers or lines yet)
  const info = scanning ? (scanPic?.info ?? null) : mapInfo;
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
  const [naming, setNaming] = useState<'marker' | 'line' | 'map' | null>(null); // the name dialog, for what
  const [drawing, setDrawing] = useState<{ x: number; y: number }[] | null>(null); // a new no-go line's points
  const [litLine, setLitLine] = useState<string | null>(null); // the line picked in LINES, drawn brighter
  const [editLine, setEditLine] = useState<string | null>(null); // the line in the edit dialog
  const [editing, setEditing] = useState<MapMarker | null>(null); // the marker in the edit dialog
  const [note, setNote] = useState<{ key: TextKey; bad?: boolean } | null>(null);
  // VIEW: what is drawn on the map besides it; BASE: the base's sensors while its list is open
  const [layers, setLayers] = useState<Record<Layer, boolean>>({ follow: false, laser: false, trail: false, plan: false });
  const [plan, setPlan] = useState<{ x: number; y: number }[] | null>(null);
  const [sensors, setSensors] = useState<Sensors | null>(null);
  const [sensorsMissing, setSensorsMissing] = useState(false); // the robot's API has no /agv/sensors yet
  const [navFullW, setNavFullW] = useState(0); // the navbar with its words, measured out of sight
  const base = status?.base ?? null;

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

  // a new map being made already (the app was closed while scanning, or the base's own page started it): show it
  useEffect(() => {
    let alive = true;
    getScanState(url).then(
      (s) => {
        if (!alive || !s.mapping) return;
        setScanning(s);
        setControl(true);
      },
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [url]);
  const mapping = scanning !== null;
  const scanName = scanning?.name ?? '';
  const scanFloor = scanning?.floor ?? 1;
  // while mapping: the state each second (pose, progress; it may end on the robot), the picture a little less often.
  // One request at a time each, so a slow answer never piles them up. Not while it saves: the scan ends then.
  useEffect(() => {
    if (!mapping || scanBusy) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = () =>
      getScanState(url)
        .then(
          (s) => {
            if (!alive) return;
            if (s.mapping) return setScanning(s);
            setScanning(null);
            setNote({ key: 'mapScanEnded' });
            load();
          },
          () => {},
        )
        .finally(() => {
          if (alive) timer = setTimeout(read, MAPPING_STATE_MS);
        });
    timer = setTimeout(read, MAPPING_STATE_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [mapping, scanBusy, url, load]);
  useEffect(() => {
    if (!mapping) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = () =>
      getScanPicture(url, scanName, scanFloor)
        .then(
          (p) => alive && p && setNextPic(p),
          () => {},
        )
        .finally(() => {
          if (alive) timer = setTimeout(read, MAPPING_PICTURE_MS);
        });
    read();
    return () => {
      alive = false;
      clearTimeout(timer);
      setScanPic(null);
      setNextPic(null);
    };
  }, [mapping, url, scanName, scanFloor]);

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

  // setting the position: the lidar once a second, drawn at Lumi's place now (red) and at the new one (purple);
  // VIEW laser: the same, drawn at Lumi's place
  const lidarOn = positioning || layers.laser;
  useEffect(() => {
    if (!lidarOn) return;
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
  }, [lidarOn, url]);

  // the trail: where Lumi drove on this map, kept from the pose the robot gives each second (a new map starts anew)
  const trailKey = scanning ? `scan:${scanning.name}` : mapInfo ? `${mapInfo.name}/${mapInfo.floor}` : '';
  const livePose = scanning ? scanning.pose : (status?.pose ?? null);
  const [trail, setTrail] = useState<{ key: string; trail: Trail }>({ key: '', trail: [] });
  const trailFrom = useRef<{ key: string; pose: { x: number; y: number } | null }>({ key: '', pose: null });
  useEffect(() => {
    trailFrom.current = { key: trailKey, pose: livePose };
  });
  useEffect(() => {
    const id = setInterval(() => {
      const { key, pose: p } = trailFrom.current;
      if (!key || !p) return;
      const at = { x: p.x, y: p.y };
      setTrail((tr) => {
        if (tr.key !== key) return { key, trail: addToTrail([], at) };
        const next = addToTrail(tr.trail, at);
        return next === tr.trail ? tr : { key, trail: next };
      });
    }, TRAIL_EVERY_MS);
    return () => clearInterval(id);
  }, []);

  // VIEW planned path: the base's path once a second while it drives
  const planOn = layers.plan && driving(base) && !mapping;
  useEffect(() => {
    if (!planOn) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = () =>
      getPlan(url)
        .then(
          (p) => alive && setPlan(p),
          (e) => {
            if (!alive || !(e instanceof NeedsUpdateError)) return;
            alive = false;
            setLayers((l) => ({ ...l, plan: false }));
            setNote({ key: 'needsUpdate', bad: true });
          },
        )
        .finally(() => {
          if (alive) timer = setTimeout(read, PLAN_EVERY_MS);
        });
    read();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [planOn, url]);

  // BASE open: speed, ultrasonic and infrared once a second (one request at a time)
  const sensorsOn = menu === 'base' && !sensorsMissing;
  useEffect(() => {
    if (!sensorsOn) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = () =>
      getSensors(url)
        .then(
          (v) => alive && setSensors(v),
          (e) => {
            if (!alive) return;
            if (e instanceof NeedsUpdateError) {
              alive = false;
              setSensorsMissing(true);
            } else setSensors(null);
          },
        )
        .finally(() => {
          if (alive) timer = setTimeout(read, SENSORS_EVERY_MS);
        });
    read();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [sensorsOn, url]);

  const toggleLayer = (l: Layer) => {
    Haptics.selectionAsync().catch(() => {});
    setLayers((v) => ({ ...v, [l]: !v[l] }));
    if (l === 'laser' && layers.laser && !positioning) setScan(null);
  };

  useEffect(() => {
    if (!note) return;
    const id = setTimeout(() => setNote(null), NOTE_MS);
    return () => clearTimeout(id);
  }, [note]);

  const fit = useMemo(() => (info ? fitMap(info.width, info.height, frame.w, frame.h) : null), [info, frame.w, frame.h]);
  const viewKey = info ? `${info.name}/${info.floor}/${frame.w}x${frame.h}` : '';
  const zoom = zv.key === viewKey ? zv.zoom : 1;
  const manualOffset = (zv.key === viewKey && zv.offset) || {
    x: fit?.left ?? 0,
    y: fit?.top ?? 0,
  };
  const scale = (fit?.scale ?? 0) * zoom;
  // VIEW follow (the base page's track): Lumi stays in the middle of the frame; a drag of the map ends it
  const following = layers.follow && !positioning && !drawing && !!livePose && !!info && scale > 0;
  const offset =
    following && info && livePose
      ? (() => {
          const p = worldToPixel(info, livePose.x, livePose.y);
          return clampOffset(
            centreOn(p.x, p.y, scale, frame.w, frame.h),
            info.width * scale,
            info.height * scale,
            frame.w,
            frame.h,
          );
        })()
      : manualOffset;
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
    /** drawing a line: the point this finger moves; `created`: put down by this touch (`first`: the line's start) */
    draw?: { index: number; created: boolean; first: boolean };
  } | null>(null);
  /** A place on the screen (frame coordinates) in the map frame; null outside the picture. */
  const viewToWorld = (vx: number, vy: number) => {
    if (!info || scale === 0) return null;
    const px = (vx - offset.x) / scale;
    const py = (vy - offset.y) / scale;
    return px < 0 || py < 0 || px > info.width || py > info.height ? null : pixelToWorld(info, px, py);
  };
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
    // drawing a line: a finger on a point moves it; elsewhere it puts a new point down and drags it (the line follows)
    if (drawing) {
      const vx = n.pageX - frame.x;
      const vy = n.pageY - frame.y;
      const near = drawing.findIndex((q) => {
        const v = toView(q.x, q.y);
        return Math.hypot(v.x - vx, v.y - vy) < GRAB_PX;
      });
      if (near >= 0) touch.current.draw = { index: near, created: false, first: false };
      else {
        const w = viewToWorld(vx, vy);
        if (!w) return;
        Haptics.selectionAsync().catch(() => {});
        const first = drawing.length === 0;
        touch.current.draw = { index: first ? 1 : drawing.length, created: true, first };
        setDrawing(first ? [w, w] : [...drawing, w]); // the first stroke: its start stays, its end follows the finger
      }
    }
  };
  const onMove = (e: GestureResponderEvent) => {
    const t = touch.current;
    if (!t) return;
    const two = spread(e);
    if (two && t.draw) {
      // a second finger: it was a pinch, not a point
      const { created, first } = t.draw;
      if (created) setDrawing((d) => (d ? (first ? [] : d.slice(0, -1)) : d));
      t.draw = undefined;
    }
    const endFollow = () => {
      if (!layers.follow) return;
      setLayers((l) => ({ ...l, follow: false }));
      setNote({ key: 'viewFollowOff' });
    };
    if (two) {
      endFollow();
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
    if (t.draw) {
      const w = viewToWorld(n.pageX - frame.x, n.pageY - frame.y);
      const i = t.draw.index;
      if (w) setDrawing((d) => d && d.map((q, k) => (k === i ? w : q)));
      return;
    }
    if (drawing) return; // drawing: one finger draws, two move the map
    if (positioning) {
      if (!t.aimed) tap(t.x - frame.x, t.y - frame.y); // the place is where the finger went down
      t.aimed = true;
      setAim(headingFromDrag(dx, dy));
      return;
    }
    endFollow();
    place(t.zoom, { x: t.off.x + dx, y: t.off.y + dy });
  };
  const onRelease = (e: GestureResponderEvent) => {
    const t = touch.current;
    touch.current = null;
    if (t?.draw) {
      if (t.draw.first && !t.moved) setDrawing((d) => d && d.slice(0, 1)); // a tap: the start alone
      return;
    }
    if (drawing) return;
    if (t && !t.moved) tap(e.nativeEvent.pageX - frame.x, e.nativeEvent.pageY - frame.y);
  };

  const done = (key: TextKey) => () => setNote({ key });
  const failedNote = (e: unknown) => setNote({ key: e instanceof BusyError ? 'busy' : 'noAnswer', bad: true });

  const tap = (vx: number, vy: number) => {
    if (!info || scale === 0 || mapping) return; // the new map has nothing to pick yet
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
    setNaming(null);
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
  // a switch is done when /map/info names the new map: one reload after a fixed wait missed a slow restart (2026-11-17)
  const [switching, setSwitching] = useState<string | null>(null);
  useEffect(() => {
    if (!switching) return;
    let alive = true;
    const started = Date.now();
    const id = setInterval(() => {
      if (Date.now() - started > SWITCH_GIVE_UP_MS) {
        setSwitching(null);
        setNote({ key: 'noAnswer', bad: true });
        load();
        return;
      }
      getMapInfo(url).then(
        (m) => {
          if (!alive || m.name !== switching) return;
          setSwitching(null);
          setInfo(m);
          setVersion(Date.now());
          setFailed(false);
          setNote({ key: 'mapSwitched' });
        },
        () => {}, // restarting
      );
    }, SWITCH_EVERY_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [switching, url, load]);

  const switchTo = (name: string, floor: number) =>
    setAsk({
      title: `${t('mapSwitchAsk')} ${name}`,
      choices: [
        {
          text: t('mapMaps'),
          onPress: () => {
            setMenu(null);
            setPicked(null);
            setPoint(null);
            switchMap(url, name, floor).then(() => setSwitching(name), failedNote);
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

  // MAPPING: a name, a confirm, then the base scans while Lumi is driven by the joystick
  const beginMapping = () => {
    setMenu(null);
    setPositioning(false);
    setScan(null);
    setDrawing(null);
    setPicked(null);
    setPoint(null);
    setLitLine(null);
    setNaming('map');
  };
  const startMapping = (name: string) => {
    setNaming(null);
    setAsk({
      title: t('mapScanAsk'),
      choices: [
        {
          text: t('mapScanStart'),
          onPress: () =>
            startScan(url, name).then(() => {
              setScanning({ mapping: true, name, floor: 1, pose: null, progress: null });
              setControl(true);
              setNote({ key: 'mapScanHint' });
            }, failedNote),
        },
      ],
    });
  };
  const endMapping = (key: TextKey) => {
    setScanBusy(false);
    setScanning(null);
    setControl(false);
    setNote({ key });
    setTimeout(load, SAVED_RELOAD_MS);
  };
  const saveMapping = () =>
    setAsk({
      title: saveEarly(scanning?.progress ?? null) ? t('mapScanSaveEarly') : t('mapScanSaveAsk'),
      choices: [
        {
          text: t('mapSave'),
          onPress: () => {
            setScanBusy(true);
            saveScan(url).then(
              () => endMapping('mapScanSaved'),
              (e) => {
                setScanBusy(false);
                failedNote(e);
              },
            );
          },
        },
      ],
    });
  /** The base has no cancel: stopping a scan saves it, so STOP says so and saves (owner, 2026-11-18). */
  const stopMapping = () =>
    setAsk({
      title: t('mapScanStopAsk'),
      choices: [
        {
          text: t('mapScanStop'),
          onPress: () => {
            setScanBusy(true);
            saveScan(url).then(
              () => endMapping('mapScanSaved'),
              (e) => {
                setScanBusy(false);
                failedNote(e);
              },
            );
          },
        },
      ],
    });

  /** While mapping only CONTROL works (and MAPPING shows it is on); the rest needs the base's map. */
  const offWhileMapping = (key: Item) => mapping && !['control', 'mapping', 'view', 'base', 'settings'].includes(key);
  const press = (item: (typeof ITEMS)[number]) => {
    Haptics.selectionAsync().catch(() => {});
    if (item.soon) return setNote({ key: 'soon' });
    if (offWhileMapping(item.key)) return setNote({ key: 'mapScanFirst' });
    if (item.key === 'mapping') return mapping ? undefined : beginMapping();
    if (item.list) return setMenu((m) => (m === item.key ? null : (item.key as Menu)));
    setMenu(null);
    if (item.key === 'position') return startPositioning(!positioning);
    if (item.key === 'control') {
      if (positioning) startPositioning(false);
      setControl((c) => !c);
    }
  };
  const startDrawing = () => {
    Haptics.selectionAsync().catch(() => {});
    setMenu(null);
    setPositioning(false);
    setPicked(null);
    setPoint(null);
    setLitLine(null);
    setDrawing([]);
    setNote({ key: 'mapLineHint' });
  };
  const saveDrawn = (name: string) => {
    setNaming(null);
    if (!drawing || drawing.length < 2) return;
    saveLine(url, name, drawing).then(() => {
      setNote({ key: 'mapLineSaved' });
      setDrawing(null);
      load();
    }, failedNote);
  };
  const renameLine = (old: string, name: string) => {
    setEditLine(null);
    const line = info?.lines.find((l) => l.name === old);
    if (!line) return;
    // as the base's own page: saved under the new name, then the old one deleted
    saveLine(url, name, line.points)
      .then(() => deleteLine(url, old))
      .then(() => {
        setNote({ key: 'mapLineRenamed' });
        if (litLine === old) setLitLine(name);
        load();
      }, failedNote);
  };
  const removeLine = (name: string) =>
    setAsk({
      title: `${t('mapDeleteLineAsk')} ${name}`,
      choices: [
        {
          text: t('delete'),
          destructive: true,
          onPress: () =>
            deleteLine(url, name).then(() => {
              setNote({ key: 'mapLineDeleted' });
              if (litLine === name) setLitLine(null);
              load();
            }, failedNote),
        },
      ],
    });

  const startPositioning = (on: boolean) => {
    setMenu(null);
    setDrawing(null);
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

  const pose = livePose; // on the new map while mapping
  const trailNow = trail.key === trailKey ? trail.trail : [];
  const laserPts =
    layers.laser && !positioning && scan && pose ? scanToWorld(scan, pose) : null;
  const lumi = pose && info ? toView(pose.x, pose.y) : null;
  const size = info ? footprintPx(info.resolution, scale) : 0; // Lumi's 510 mm base on screen
  const markerSize = Math.max(MARKER_MIN, size * 0.7);
  const lumiSize = Math.max(LUMI_MIN, size);
  const target = picked !== null || point !== null; // a marker or a point is picked: the bar shows
  const navTop = 14 + inset.top + Math.max(44, 0.075 * h);

  // the route's panel: the map's top left corner, open while ROUTE is
  const routeTop = navTop + navH + 22;
  const toggleRoute = () => {
    Haptics.selectionAsync().catch(() => {});
    setMenu((m) => (m === 'route' ? null : 'route'));
  };
  // closed: a pill in the map's top left corner (the nav's look); open: a card in the same corner
  const routePanel =
    !info || positioning || drawing || mapping ? null : menu !== 'route' ? (
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
            setNaming('marker');
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
  } else if (menu === 'lines' && info) {
    list = (
      <>
        <Pressable onPress={startDrawing} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
          <Text style={[styles.rowText, styles.rowAdd]}>+ {t('mapAddLine')}</Text>
        </Pressable>
        {info.lines.length > 0 && <View style={styles.sep} />}
        {info.lines.map((l) => (
          <Pressable
            key={l.name}
            onPress={() => setLitLine((n) => (n === l.name ? null : l.name))}
            style={({ pressed }) => [styles.row, litLine === l.name && styles.rowOn, pressed && styles.pressed]}
          >
            <Text style={[styles.rowText, litLine === l.name && styles.rowTextOn]}>{l.name}</Text>
            <Pressable
              onPress={() => {
                setMenu(null);
                setEditLine(l.name);
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`${t('mapEditLine')} ${l.name}`}
              style={({ pressed }) => pressed && styles.pressed}
            >
              <Pencil />
            </Pressable>
          </Pressable>
        ))}
      </>
    );
  } else if (menu === 'maps' && mapInfo) {
    const isOn = (m: { name: string; floor: number }) => m.name === mapInfo.name && m.floor === mapInfo.floor;
    // the map in use first, set apart; then the others, the newest first (the API's order)
    list = [...mapInfo.maps.filter(isOn), ...mapInfo.maps.filter((m) => !isOn(m))].map((m, i) => {
      const on = isOn(m);
      const going = switching === m.name;
      return (
        <View key={`${m.name}/${m.floor}`}>
          <Pressable
            onPress={() => !on && !switching && switchTo(m.name, m.floor)}
            disabled={on || !!switching}
            style={({ pressed }) => [styles.row, on && styles.mapRowOn, pressed && styles.pressed]}
          >
            <Text style={[styles.rowText, on && styles.mapTextOn, going && styles.rowTextOn]} numberOfLines={1}>
              {m.name}
            </Text>
            {on && <Text style={styles.mapInUse}>{t('mapInUse')}</Text>}
            {going && <Text style={styles.mapInUse}>{t('mapSwitching')}</Text>}
          </Pressable>
          {on && i === 0 && mapInfo.maps.length > 1 && <View style={styles.sep} />}
        </View>
      );
    });
  } else if (menu === 'view') {
    list = (
      <ViewList
        on={layers}
        onToggle={toggleLayer}
        trailPoints={trailLength(trailNow)}
        onClearTrail={() => setTrail({ key: trailKey, trail: [] })}
      />
    );
  } else if (menu === 'base') {
    list = <BaseList base={base} sensors={sensors} needsUpdate={sensorsMissing} />;
  } else if (menu === 'settings') {
    list = <BaseSettingsList baseUrl={url} ask={setAsk} note={(key, bad) => setNote({ key, bad })} />;
  }
  // a phone: the navbar shows its icons only (it would not fit with the words); a list then says whose it is
  const compact = navFullW > w - inset.left - inset.right - 24;
  const menuItem = ITEMS.find((i) => i.key === menu);

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
            source={{ uri: scanPic && mapping ? scanPic.uri : mapImageUrl(url, info, version) }}
            style={{
              position: 'absolute',
              left: offset.x,
              top: offset.y,
              width: info.width * scale,
              height: info.height * scale,
            }}
            resizeMode="stretch"
            onError={() => !mapping && setFailed(true)}
          />
        )}
        {info && scale > 0 && info.lines.length > 0 && (
          <Svg width={frame.w} height={frame.h} style={StyleSheet.absoluteFill} pointerEvents="none">
            {info.lines.map((l) => (
              <Path
                key={l.name}
                d={l.points.map((q, i) => `${i ? 'L' : 'M'}${toView(q.x, q.y).x} ${toView(q.x, q.y).y}`).join(' ')}
                stroke={mono.red}
                strokeOpacity={litLine && litLine !== l.name ? 0.45 : 0.9}
                strokeWidth={litLine === l.name ? 4 : 2}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            ))}
          </Svg>
        )}
        {info && scale > 0 && (
          <MapLayers
            width={frame.w}
            height={frame.h}
            toView={toView}
            trail={layers.trail ? trailNow : null}
            plan={planOn ? plan : null}
            laser={laserPts}
          />
        )}
        {info?.markers.map((m) => {
          const p = toView(m.x, m.y);
          const on = picked === m.name;
          const stroke = on ? mono.red : m.dock ? mono.blue : '#8a8a8a';
          return (
            <View key={m.name} style={StyleSheet.absoluteFill} pointerEvents={drawing ? 'none' : 'box-none'}>
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
                hitSlop={Math.max(0, (28 - markerSize) / 2)}
                style={{
                  position: 'absolute',
                  left: p.x - markerSize / 2,
                  top: p.y - markerSize / 2,
                  width: markerSize,
                  height: markerSize,
                  transform: [{ rotate: `${-m.theta}rad` }],
                }}
              >
                <MarkerMark size={markerSize} color={stroke} />
              </Pressable>
              <View pointerEvents="none" style={[styles.labelRight, { left: p.x + markerSize / 2 + 1, top: p.y - 9 }]}>
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
            style={[styles.pin, { left: toView(point.x, point.y).x - PIN_W / 2, top: toView(point.x, point.y).y - PIN_H }]}
          >
            <PointPin />
          </View>
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
        {drawing && info && scale > 0 && (
          <Svg width={frame.w} height={frame.h} style={StyleSheet.absoluteFill} pointerEvents="none">
            {drawing.length > 1 && (
              <Path
                d={drawing.map((q, i) => `${i ? 'L' : 'M'}${toView(q.x, q.y).x} ${toView(q.x, q.y).y}`).join(' ')}
                stroke={mono.red}
                strokeWidth={3}
                strokeDasharray="8 5"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            )}
            {drawing.map((q, i) => (
              <Circle key={i} cx={toView(q.x, q.y).x} cy={toView(q.x, q.y).y} r={7} fill={mono.red} stroke="#fff" strokeWidth={2} />
            ))}
          </Svg>
        )}
        {lumi && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: lumi.x - lumiSize / 2,
              top: lumi.y - lumiSize / 2,
              transform: [{ rotate: `${-(pose?.theta ?? 0)}rad` }],
            }}
          >
            <Footprint size={lumiSize} stroke={mono.green} fill="rgba(61,255,139,0.12)" />
          </View>
        )}
        {nextPic && (
          // the next picture loads out of sight and then takes the place of the shown one (no blank frame between)
          <Image
            source={{ uri: nextPic.uri }}
            style={styles.preload}
            onLoad={() => {
              setScanPic((shown) => keepPicture(shown, nextPic));
              setNextPic(null);
            }}
            onError={() => setNextPic(null)}
          />
        )}
        {!info && <Text style={styles.center}>{t(mapping ? 'mapScanWaiting' : failed ? 'mapNoMap' : 'mapLoading')}</Text>}
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
            const on =
              (item.key === 'control' && control) ||
              (item.key === 'position' && positioning) ||
              (item.key === 'mapping' && mapping) ||
              menu === item.key;
            const color = item.soon || offWhileMapping(item.key) ? mono.dim : on ? mono.text : mono.soft;
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
                accessibilityLabel={t(item.label)}
                accessibilityState={{ selected: on, disabled: item.soon || offWhileMapping(item.key) }}
                style={({ pressed }) => [styles.item, on && styles.itemOn, pressed && styles.pressed]}
              >
                <Icon item={item.key} color={color} />
                {!compact && <Text style={[styles.itemText, { color }]}>{t(item.label)}</Text>}
                {item.list && <Chevron up={menu === item.key} color={color} size={11} />}
              </Pressable>
            );
          })}
        </View>
        {/* the same navbar with its words, out of sight: its width says whether the words fit */}
        <View style={styles.navMeasure} pointerEvents="none">
          <View
            style={styles.nav}
            onLayout={(e: LayoutChangeEvent) => {
              const nw = Math.round(e.nativeEvent.layout.width);
              setNavFullW((v) => (v === nw ? v : nw));
            }}
          >
            {ITEMS.map((item) => (
              <View key={item.key} style={styles.item}>
                <Icon item={item.key} color={mono.soft} />
                <Text style={styles.itemText}>{t(item.label)}</Text>
                {item.list && <Chevron size={11} />}
              </View>
            ))}
          </View>
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
          {compact && menuItem && <Text style={styles.listTitle}>{t(menuItem.label)}</Text>}
          {list}
        </ScrollView>
      )}

      {scanning && (
        <View style={[styles.bar, { bottom: 18 + inset.bottom + DOCK_SPACE + 14 }]}>
          <View style={styles.barLabel}>
            <View style={[styles.barDot, styles.barDotScan]} />
            <Text style={styles.barTarget} numberOfLines={1}>
              {scanning.name}
            </Text>
          </View>
          {scanning.progress !== null && (
            <Text style={[styles.barProgress, scanning.progress >= 1 && styles.barProgressDone]}>
              {t('mapScanOptimized')} {progressText(scanning.progress)}
            </Text>
          )}
          {scanBusy ? (
            <Text style={[styles.btnText, styles.barBusy]}>{t('mapScanSaving')}</Text>
          ) : (
            <>
              <Pressable onPress={stopMapping} style={({ pressed }) => [styles.btn, styles.btnQuiet, pressed && styles.pressed]}>
                <Text style={styles.btnText}>{t('mapScanStop')}</Text>
              </Pressable>
              <Pressable onPress={saveMapping} style={({ pressed }) => [styles.btn, styles.btnGo, pressed && styles.pressed]}>
                <Text style={[styles.btnText, styles.btnGoText]}>{t('mapSave')}</Text>
              </Pressable>
            </>
          )}
        </View>
      )}
      {run && !positioning && !mapping && (
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
      {drawing && (
        <View style={[styles.bar, { bottom: 18 + inset.bottom + DOCK_SPACE + 14 }]}>
          <Text style={styles.barTarget}>{t('mapNewLine')}</Text>
          <Pressable
            onPress={() => setDrawing(drawing.slice(0, -1))}
            disabled={!drawing.length}
            style={({ pressed }) => [styles.btn, styles.btnQuiet, !drawing.length && styles.btnOff, pressed && styles.pressed]}
          >
            <Text style={styles.btnText}>{t('mapUndo')}</Text>
          </Pressable>
          <Pressable
            onPress={() => setDrawing([])}
            disabled={!drawing.length}
            style={({ pressed }) => [styles.btn, styles.btnQuiet, !drawing.length && styles.btnOff, pressed && styles.pressed]}
          >
            <Text style={styles.btnText}>{t('mapRouteClear')}</Text>
          </Pressable>
          <Pressable onPress={() => setDrawing(null)} style={({ pressed }) => [styles.btn, styles.btnQuiet, pressed && styles.pressed]}>
            <Text style={styles.btnText}>{t('cancel')}</Text>
          </Pressable>
          <Pressable
            onPress={() => setNaming('line')}
            disabled={drawing.length < 2}
            style={({ pressed }) => [styles.btn, styles.btnGo, drawing.length < 2 && styles.btnOff, pressed && styles.pressed]}
          >
            <Text style={[styles.btnText, styles.btnGoText]}>{t('mapSave')}</Text>
          </Pressable>
        </View>
      )}
      {!run && !drawing && !mapping && (target || positioning) && (
        <View style={[styles.bar, { bottom: 18 + inset.bottom + DOCK_SPACE + 14 }]}>
          {picked && !positioning && (
            <View style={styles.barLabel}>
              <View style={[styles.barDot, styles.barDotMarker]} />
              <Text style={styles.barTarget} numberOfLines={1}>
                {picked}
              </Text>
            </View>
          )}
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
                <Pressable onPress={() => setNaming('marker')} style={({ pressed }) => [styles.barBtn, pressed && styles.pressed]}>
                  <Svg width={13} height={13} viewBox="0 0 24 24">
                    <Path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z" stroke={mono.text} strokeWidth={2} fill="none" />
                    <Path d="M12 7v6M9 10h6" stroke={mono.text} strokeWidth={2} strokeLinecap="round" />
                  </Svg>
                  <Text style={styles.btnText}>{t('mapSaveMarker')}</Text>
                </Pressable>
              )}
              <Pressable onPress={go} style={({ pressed }) => [styles.barBtn, pressed && styles.pressed]}>
                <Svg width={13} height={13} viewBox="0 0 24 24">
                  <Path
                    d="M5 12h13M13 6l6 6-6 6"
                    stroke={mono.text}
                    strokeWidth={2.4}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </Svg>
                <Text style={styles.btnText}>{t('mapGoHere')}</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setPicked(null);
                  setPoint(null);
                }}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={t('cancel')}
                style={({ pressed }) => [styles.barClose, pressed && styles.pressed]}
              >
                <Cross color={mono.soft} size={11} />
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
        open={naming === 'marker'}
        title="mapMarkerName"
        rule="mapNameRule"
        initial={nextMarkerName(info?.markers.map((m) => m.name) ?? [])}
        valid={validMarkerName}
        onDone={save}
        onClose={() => setNaming(null)}
      />
      <NameDialog
        open={naming === 'line'}
        title="mapLineName"
        rule="mapNameRule"
        initial={nextMarkerName(info?.lines.map((l) => l.name) ?? [], 'line')}
        valid={(n) => validMarkerName(n) && !info?.lines.some((l) => l.name === n)}
        onDone={saveDrawn}
        onClose={() => setNaming(null)}
      />
      <NameDialog
        open={naming === 'map'}
        title="mapScanName"
        rule="mapScanRule"
        initial={nextMarkerName(mapInfo?.maps.map((m) => m.name) ?? [], 'map_')}
        valid={(n) =>
          validNewMapName(
            n,
            (mapInfo?.maps ?? []).map((m) => m.name),
          )
        }
        onDone={startMapping}
        onClose={() => setNaming(null)}
      />
      <MarkerDialog
        marker={editLine ? { name: editLine } : null}
        title="mapEditLine"
        names={info?.lines.map((l) => l.name) ?? []}
        onRename={(name) => editLine && renameLine(editLine, name)}
        onDelete={() => {
          if (!editLine) return;
          setEditLine(null);
          removeLine(editLine);
        }}
        onClose={() => setEditLine(null)}
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
  labelRight: { position: 'absolute', alignItems: 'flex-start' },
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
  pin: { position: 'absolute', width: PIN_W, height: PIN_H + 5 },
  // wide enough for any navbar, so the copy inside keeps its own width
  navMeasure: { position: 'absolute', top: -400, left: 0, width: 4000, flexDirection: 'row', opacity: 0 },
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
  rowAdd: { color: mono.green, fontFamily: fonts.monoBold },
  mapRowOn: { backgroundColor: 'rgba(61,255,139,0.10)', borderWidth: 1, borderColor: 'rgba(61,255,139,0.45)' },
  mapTextOn: { color: mono.green, fontFamily: fonts.monoBold },
  mapInUse: { fontFamily: fonts.monoBold, fontSize: 9, letterSpacing: 1.2, color: mono.green, textTransform: 'uppercase' },
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
  addStopText: { fontFamily: fonts.monoBold, fontSize: 12, color: mono.green }, // like + Add marker and + Add line
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
  barLabel: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingLeft: 8, paddingRight: 4, maxWidth: 180 },
  barDot: { width: 8, height: 8, borderRadius: 4 },
  barDotMarker: { backgroundColor: mono.red },
  barDotScan: { backgroundColor: mono.green },
  // the optimizing progress beside the new map's name, green once it is done (then SAVE is best)
  barProgress: { fontFamily: fonts.mono, fontSize: 11, color: mono.soft, paddingRight: 4 },
  barProgressDone: { color: mono.green },
  barBusy: { color: mono.soft, paddingHorizontal: 14 },
  preload: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  // SAVE MARKER and GO HERE: the same button, an icon and a word
  barBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 15,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: mono.text,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  barClose: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#444',
    marginLeft: 2,
  },
  btnStop: { borderColor: mono.red },
  btnStopText: { color: mono.red },
  pressed: { opacity: 0.6 },
});
