import { useEffect, useRef, useState, type ComponentType, type Ref } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeOut } from 'react-native-reanimated';
import { router } from 'expo-router';
import { Asset } from 'expo-asset';
import { WebView, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';
import { SCENE_HTML } from '../scene/sceneHtml';
import { getArmJoints, getStatus, type RobotStatus } from '../lib/api';
import { toSceneState, type SceneState } from '../scene/sceneState';
import { RobotHud } from '../ui/RobotHud';
import { session } from '../lib/session';
import { colors } from '../ui/theme';
import { ConnectingView } from '../ui/ConnectingView';

// react-native-webview 14 class typings resolve to `never` under React Native 0.88's strict TS API;
// the runtime component is fine, so it is given its documented props here.
const SceneView = WebView as unknown as ComponentType<WebViewProps & { ref?: Ref<WebView> }>;

const POLL_MS = 1000;
const LOST_AFTER_FAILS = 3;

interface ModelSource {
  glbUri: string;
  /** The page is given the model's own folder or server as its base, so loading it is same origin. */
  baseUrl: string;
}

async function loadModel(): Promise<ModelSource> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro bundles assets through require
  const asset = Asset.fromModule(require('../../assets/model/lumi.glb'));
  // while developing, the model comes from the Metro server; in a built app it is a local file
  if (asset.uri.startsWith('http')) {
    const origin = asset.uri.match(/^https?:\/\/[^/]+/)?.[0] ?? asset.uri;
    return { glbUri: asset.uri, baseUrl: `${origin}/` };
  }
  await asset.downloadAsync();
  const file = asset.localUri ?? asset.uri;
  return { glbUri: file, baseUrl: file.slice(0, file.lastIndexOf('/') + 1) };
}

export default function Home() {
  const web = useRef<WebView>(null);
  const [model, setModel] = useState<ModelSource | null>(null);
  const [sceneReady, setSceneReady] = useState(false);
  const [status, setStatus] = useState<RobotStatus | null>(null);

  useEffect(() => {
    loadModel().then(setModel, (e) => console.warn('model', e));
  }, []);

  // keep the scene's state in step with the robot; the HUD reads the same status
  const sceneReadyRef = useRef(false);
  const lastScene = useRef<SceneState | null>(null);

  const pushScene = (st: SceneState) => {
    lastScene.current = st;
    if (sceneReadyRef.current) web.current?.injectJavaScript(`window.lumi && window.lumi.setState(${JSON.stringify(st)}); true;`);
  };

  // the scene may finish loading after the first reply; give it what is already known
  useEffect(() => {
    sceneReadyRef.current = sceneReady;
    if (sceneReady && lastScene.current) pushScene(lastScene.current);
  }, [sceneReady]);

  useEffect(() => {
    const conn = session.connection;
    if (!conn) {
      router.replace('/');
      return;
    }
    let fails = 0;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // one request after another, never piling up when the robot is slow to answer
    const tick = async () => {
      const started = Date.now();
      try {
        const st = await getStatus(conn.baseUrl);
        const joints = st.armState === 'off' ? null : await getArmJoints(conn.baseUrl).catch(() => null);
        fails = 0;
        if (!alive) return;
        setStatus(st);
        pushScene(toSceneState(st, joints));
      } catch {
        fails += 1;
        if (alive && fails >= LOST_AFTER_FAILS) {
          session.set(null);
          router.replace('/');
          return;
        }
      }
      if (alive) timer = setTimeout(tick, Math.max(0, POLL_MS - (Date.now() - started)));
    };
    tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const onMessage = (e: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data) as { type: string; message?: string; ms?: number; fps?: number; pixelRatio?: number };
      if (__DEV__ && msg.type === 'ready') console.log(`scene ready after ${msg.ms} ms`);
      if (__DEV__ && msg.type === 'perf') console.log(`scene ${msg.fps} fps at ${msg.pixelRatio}x`);
      if (msg.type === 'ready') setSceneReady(true);
      if (msg.type === 'error') console.warn('scene', msg.message);
    } catch {
      // not ours
    }
  };

  return (
    <View style={styles.root}>
      {model && (
        <SceneView
          ref={web}
          style={styles.web}
          originWhitelist={['*']}
          source={{ html: SCENE_HTML, baseUrl: model.baseUrl }}
          injectedJavaScriptBeforeContentLoaded={`document.documentElement.classList.add('in-app'); window.LUMI_GLB = ${JSON.stringify(model.glbUri)}; true;`}
          onMessage={onMessage}
          allowFileAccess
          allowFileAccessFromFileURLs
          allowingReadAccessToURL={model.baseUrl}
          javaScriptEnabled
          scrollEnabled={false}
          bounces={false}
          overScrollMode="never"
          setBuiltInZoomControls={false}
          mixedContentMode="always"
        />
      )}
      <RobotHud status={status} />
      {/* Lumi keeps looking at you until the 3D robot is drawn, then the scene shows through */}
      {!sceneReady && (
        <Animated.View style={StyleSheet.absoluteFill} exiting={FadeOut.duration(450)} pointerEvents="none">
          <ConnectingView connected />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#02040a' },
  web: { flex: 1, backgroundColor: colors.bg },
});
