import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type Ref } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, { FadeOut } from 'react-native-reanimated';
import { Asset } from 'expo-asset';
import { useIsFocused } from 'expo-router';
import { WebView, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';
import { SCENE_HTML } from '../../scene/sceneHtml';
import { toSceneState, type SceneState } from '../../scene/sceneState';
import { Joystick } from '../../ui/Joystick';
import { useRobot } from '../../lib/robot';
import { useLiveJoints } from '../../lib/useLiveJoints';
import { colors } from '../../ui/theme';
import { ConnectingView } from '../../ui/ConnectingView';
import { useLanding } from '../../lib/landing';

// react-native-webview 14 class typings resolve to `never` under React Native 0.88's strict TS API;
// the runtime component is fine, so it is given its documented props here.
const SceneView = WebView as unknown as ComponentType<WebViewProps & { ref?: Ref<WebView> }>;

interface ModelSource {
  glbUri: string;
  /** The page is given the model's own folder or server as its base, so loading it is same origin. */
  baseUrl: string;
}

/**
 * The page's settings are written into its <head> as the first script, so they exist before the scene module runs.
 * injectedJavaScriptBeforeContentLoaded is not early enough on Android: the scene then asked Metro for `lumi.glb`,
 * got the Expo manifest back, and GLTFLoader failed with "Unsupported asset".
 */
function sceneHtml(glbUri: string): string {
  const settings = `<script>document.documentElement.classList.add('in-app');window.LUMI_GLB=${JSON.stringify(glbUri).replace(/</g, '\\u003c')};</script>`;
  return SCENE_HTML.replace('<head>', `<head>${settings}`);
}

// In a browser (the web build, for looking at the screens on a computer) react-native-webview draws nothing: the scene
// goes into an iframe instead, and the page's messages come over window.postMessage.
const IS_WEB = Platform.OS === 'web';
const WEB_BRIDGE = '<script>window.ReactNativeWebView={postMessage:function(d){parent.postMessage(d,"*")}};</script>';
type SceneFrame = { contentWindow: { lumi?: { setState: (s: SceneState) => void } } | null };

async function loadModel(): Promise<ModelSource> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro bundles assets through require
  const asset = Asset.fromModule(require('../../../assets/model/lumi.glb'));
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
  const { status, joints, connection } = useRobot();
  // the arm's joints 5 times a second while Home shows it and the arm has power (the round asks once a second)
  const focused = useIsFocused();
  const armOn = !!status && status.armState !== 'off' && !status.armSilent;
  const liveJoints = useLiveJoints(connection.baseUrl, focused && armOn);
  const { done: landingDone } = useLanding();
  const html = useMemo(() => (model ? sceneHtml(model.glbUri) : ''), [model]);
  const frame = useRef<SceneFrame | null>(null);
  const setFrame = useCallback((el: HTMLIFrameElement | null) => {
    frame.current = el as SceneFrame | null;
  }, []);

  useEffect(() => {
    loadModel().then(setModel, (e) => console.warn('model', e));
  }, []);

  // keep the scene's state in step with the robot; the HUD reads the same status
  const sceneReadyRef = useRef(false);
  const lastScene = useRef<SceneState | null>(null);

  const pushScene = (st: SceneState) => {
    lastScene.current = st;
    if (!sceneReadyRef.current) return;
    if (IS_WEB) frame.current?.contentWindow?.lumi?.setState(st);
    else web.current?.injectJavaScript(`window.lumi && window.lumi.setState(${JSON.stringify(st)}); true;`);
  };

  // the scene may finish loading after the first reply; give it what is already known
  // the controls on top of the screen appear once the robot is drawn
  useEffect(() => {
    if (sceneReady) landingDone();
  }, [sceneReady, landingDone]);

  useEffect(() => {
    sceneReadyRef.current = sceneReady;
    if (sceneReady && lastScene.current) pushScene(lastScene.current);
  }, [sceneReady]);

  // the robot's pose follows every reply the layout gets
  useEffect(() => {
    if (status) pushScene(toSceneState(status, liveJoints ?? joints));
  }, [status, joints, liveJoints]);

  const onMessage = (e: WebViewMessageEvent) => handle(e.nativeEvent.data);
  const handle = (data: string) => {
    try {
      const msg = JSON.parse(data) as { type: string; message?: string; ms?: number; fps?: number; pixelRatio?: number };
      if (__DEV__ && msg.type === 'ready') console.log(`scene ready after ${msg.ms} ms`);
      if (__DEV__ && msg.type === 'perf') console.log(`scene ${msg.fps} fps at ${msg.pixelRatio}x`);
      if (msg.type === 'ready') setSceneReady(true);
      if (msg.type === 'error') console.warn('scene', msg.message);
    } catch {
      // not ours
    }
  };

  useEffect(() => {
    if (!IS_WEB) return;
    const listen = (e: { data: unknown }) => typeof e.data === 'string' && handle(e.data);
    globalThis.addEventListener?.('message', listen);
    return () => globalThis.removeEventListener?.('message', listen);
  }, []);

  return (
    <View style={styles.root}>
      {model && IS_WEB && (
        <iframe
          ref={setFrame}
          srcDoc={html.replace('<head>', `<head>${WEB_BRIDGE}`)}
          style={{ border: 0, width: '100%', height: '100%', background: colors.bg }}
        />
      )}
      {model && !IS_WEB && (
        <SceneView
          ref={web}
          style={styles.web}
          originWhitelist={['*']}
          source={{ html, baseUrl: model.baseUrl }}
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
      <Joystick />
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
