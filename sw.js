const SHELL = 'shell-v1';
const AUDIO = 'audio-v1';
const SHELL_FILES = ['./', 'index.html', 'app.js', 'style.css', 'tracks.json', 'manifest.json', 'icon-192.png', 'icon-512.png', 'icon-180.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => ![SHELL, AUDIO].includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

async function audioResponse(req) {
  const cache = await caches.open(AUDIO);
  const url = new URL(req.url); url.search = '';
  const cached = await cache.match(url.href);
  if (!cached) return fetch(req);           // not downloaded: stream from network (server handles Range)
  const range = req.headers.get('range');
  if (!range) return cached;
  const buf = await cached.arrayBuffer();
  const m = /bytes=(\d*)-(\d*)/.exec(range);
  let start = m && m[1] ? parseInt(m[1]) : 0;
  let end = m && m[2] ? parseInt(m[2]) : buf.byteLength - 1;
  if (m && !m[1] && m[2]) { start = buf.byteLength - parseInt(m[2]); end = buf.byteLength - 1; }
  end = Math.min(end, buf.byteLength - 1);
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Range': `bytes ${start}-${end}/${buf.byteLength}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes'
    }
  });
}

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.includes('/audio/')) { e.respondWith(audioResponse(e.request)); return; }
  // shell: network first (fresh when online), cache fallback offline
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const cp = r.clone(); caches.open(SHELL).then(c => c.put(e.request, cp)); }
    return r;
  }).catch(() => caches.match(e.request, {ignoreSearch: true}).then(r => r || caches.match('index.html'))));
});
