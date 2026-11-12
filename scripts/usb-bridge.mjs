// Development helper: lets an Android device or emulator without a working network reach Metro and the robot.
// adb reverse maps the device's 127.0.0.1:8081 (Metro) and 127.0.0.1:8100 (robot API) to this Mac, and a small TCP
// proxy here forwards 8100 to the first robot address that answers (robot Wi-Fi, office, Tailscale).
// Usage: npm run usb   (then `npx expo start` and press a). Ctrl+C stops the proxy.
import { execFileSync } from 'node:child_process';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const PORT = 8100;
const HOSTS = ['192.168.10.240', '192.168.0.250', '100.74.120.24'];
const sdk = process.env.ANDROID_HOME ?? path.join(os.homedir(), 'Library/Android/sdk');
const adb = path.join(sdk, 'platform-tools/adb');

function reachable(host) {
  return new Promise((resolve) => {
    const s = net.connect({ host, port: PORT, timeout: 2000 });
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('timeout', () => { s.destroy(); resolve(false); });
    s.once('error', () => resolve(false));
  });
}

const results = await Promise.all(HOSTS.map(reachable));
const target = HOSTS[results.indexOf(true)];
if (!target) {
  console.error('Lumi did not answer on any address:', HOSTS.join(', '));
  process.exit(1);
}

for (const port of [8081, PORT]) execFileSync(adb, ['reverse', `tcp:${port}`, `tcp:${port}`], { stdio: 'inherit' });

net
  .createServer((client) => {
    const upstream = net.connect({ host: target, port: PORT });
    client.pipe(upstream).pipe(client);
    const close = () => { client.destroy(); upstream.destroy(); };
    client.on('error', close);
    upstream.on('error', close);
  })
  .listen(PORT, '127.0.0.1', () => console.log(`Device 127.0.0.1:${PORT} -> Lumi ${target}:${PORT}, Metro on 8081 via adb`));
