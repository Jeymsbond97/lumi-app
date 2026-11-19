// The 3D Lumi (web/home3d.html, bundled into scene/sceneHtml.ts by `npm run scene`) in a WebView, fed a SceneState:
// Home shows the whole robot, Commands' ARM SETUP the live arm (its `view`). Each mount is its own page, so it is
// mounted only while it is shown (the phone has little memory). With `background` the view shows that colour from the
// start and fades the scene in once the page has drawn its first frame with Lumi in it (no black flash).
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type Ref } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Asset } from 'expo-asset';
import { WebView, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';
import { SCENE_HTML } from '../scene/sceneHtml';
import type { SceneState } from '../scene/sceneState';
import { colors } from './theme';

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
function sceneHtml(glbUri: string, initial: SceneState | null): string {
  const json = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c');
  const first = initial ? `window.LUMI_STATE=${json(initial)};` : '';
  const armView = initial?.view === 'arm' ? "document.documentElement.classList.add('arm-view');" : '';
  const settings = `<script>document.documentElement.classList.add('in-app');${armView}window.LUMI_GLB=${json(glbUri)};${first}</script>`;
  return SCENE_HTML.replace('<head>', `<head>${settings}`);
}

// In a browser (the web build, for looking at the screens on a computer) react-native-webview draws nothing: the scene
// goes into an iframe instead, and the page's messages come over window.postMessage.
const IS_WEB = Platform.OS === 'web';
const WEB_BRIDGE = '<script>window.ReactNativeWebView={postMessage:function(d){parent.postMessage(d,"*")}};</script>';
type SceneFrame = { contentWindow: { lumi?: { setState: (s: SceneState) => void } } | null };

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

export function LumiScene({
  state,
  onReady,
  initial,
  background,
}: {
  state: SceneState | null;
  onReady?: () => void;
  /** The state the page starts in, before its first frame (ARM SETUP's arm view: no flash of the whole robot). */
  initial?: SceneState;
  /** The colour shown until the scene has drawn its first frame, then the scene fades in over it. */
  background?: string;
}) {
  const web = useRef<WebView>(null);
  const [model, setModel] = useState<ModelSource | null>(null);
  const [ready, setReady] = useState(false);
  // without a background colour (Home: its own loading view covers it) the scene shows at once
  const shown = useSharedValue(background ? 0 : 1);
  const fade = useAnimatedStyle(() => ({ opacity: shown.get() }));
  // the page is made once per model; its first state is the one given when it was mounted
  const [first] = useState(() => initial ?? null);
  const html = useMemo(() => (model ? sceneHtml(model.glbUri, first) : ''), [model, first]);
  const frame = useRef<SceneFrame | null>(null);
  const setFrame = useCallback((el: HTMLIFrameElement | null) => {
    frame.current = el as SceneFrame | null;
  }, []);

  useEffect(() => {
    let on = true;
    loadModel().then(
      (m) => on && setModel(m),
      (e) => console.warn('model', e),
    );
    return () => {
      on = false;
    };
  }, []);

  const readyCb = useRef(onReady);
  useEffect(() => {
    readyCb.current = onReady;
  }, [onReady]);
  useEffect(() => {
    if (ready) readyCb.current?.();
  }, [ready]);

  // the scene may finish loading after the first state; it gets the latest once it is ready
  useEffect(() => {
    if (!ready || !state) return;
    if (IS_WEB) frame.current?.contentWindow?.lumi?.setState(state);
    else web.current?.injectJavaScript(`window.lumi && window.lumi.setState(${JSON.stringify(state)}); true;`);
  }, [ready, state]);

  const handle = useCallback((data: string) => {
    try {
      const msg = JSON.parse(data) as { type: string; message?: string; ms?: number; fps?: number; pixelRatio?: number };
      if (__DEV__ && msg.type === 'ready') console.log(`scene ready after ${msg.ms} ms`);
      if (__DEV__ && msg.type === 'perf') console.log(`scene ${msg.fps} fps at ${msg.pixelRatio}x`);
      if (msg.type === 'ready') setReady(true);
      if (msg.type === 'drawn') shown.set(withTiming(1, { duration: 200 }));
      if (msg.type === 'error') console.warn('scene', msg.message);
    } catch {
      // not ours
    }
  }, [shown]);
  const onMessage = (e: WebViewMessageEvent) => handle(e.nativeEvent.data);

  useEffect(() => {
    if (!IS_WEB) return;
    const listen = (e: { data: unknown; source?: unknown }) => {
      // the iframe's messages come to the whole window: only this page's count
      const own = frame.current?.contentWindow;
      if (typeof e.data === 'string' && (!e.source || e.source === own)) handle(e.data);
    };
    globalThis.addEventListener?.('message', listen);
    return () => globalThis.removeEventListener?.('message', listen);
  }, [handle]);

  const bg = background ?? colors.bg;
  if (!model) return <View style={[styles.web, { backgroundColor: bg }]} />;
  if (IS_WEB) {
    return (
      <View style={[styles.web, { backgroundColor: bg }]}>
        <Animated.View style={[styles.web, fade]}>
          <iframe
            ref={setFrame}
            srcDoc={html.replace('<head>', `<head>${WEB_BRIDGE}`)}
            style={{ border: 0, width: '100%', height: '100%', background: bg }}
          />
        </Animated.View>
      </View>
    );
  }
  return (
    <View style={[styles.web, { backgroundColor: bg }]}>
      <Animated.View style={[styles.web, fade]}>
        <SceneView
          ref={web}
          style={[styles.web, { backgroundColor: bg }]}
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
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  web: { flex: 1 },
});
