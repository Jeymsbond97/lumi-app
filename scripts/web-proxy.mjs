// Development helper: lets the app in a browser on this Mac talk to the robot. The robot API sends no CORS headers,
// so a browser refuses its answers; this proxy on 127.0.0.1:8100 (the app's 'usb' route) forwards every request to
// the first robot address that answers and adds the CORS headers.
// Usage: npm run webproxy   (then `npx expo start` and press w, or open http://localhost:8081). Ctrl+C stops it.
import http from 'node:http';
import net from 'node:net';

const PORT = 8100;
const HOSTS = ['192.168.10.240', '192.168.0.250', '100.74.120.24'];
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'access-control-allow-headers': '*',
};

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

http
  .createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS);
      res.end();
      return;
    }
    const up = http.request(
      { host: target, port: PORT, path: req.url, method: req.method, headers: { ...req.headers, host: `${target}:${PORT}` } },
      (r) => {
        res.writeHead(r.statusCode ?? 502, { ...r.headers, ...CORS });
        r.pipe(res);
      },
    );
    up.on('error', (e) => {
      if (!res.headersSent) res.writeHead(502, CORS);
      res.end(String(e.message));
    });
    req.pipe(up);
  })
  .listen(PORT, '127.0.0.1', () => console.log(`Robot API ${target}:${PORT} on http://127.0.0.1:${PORT} with CORS`));
