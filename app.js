const CATS = {
  sleep: {name: '수면 명상', desc: '몸의 긴장을 풀고 깊은 잠으로', emoji: '🌙'},
  breath: {name: '호흡 명상', desc: '숨에 집중해 마음을 가라앉히기', emoji: '🌬️'},
  walk: {name: '걷기 명상', desc: '발걸음과 감각에 머무르기', emoji: '👣'},
  lunch: {name: '점심시간 산책', desc: '오전의 긴장을 풀고 오후를 충전', emoji: '☀️'}
};
const $ = s => document.querySelector(s);
const audio = $('#audio');
let tracks = [], current = null, filter = 'all';
const fmt = s => { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const abs = p => new URL(p, location.href).href;

async function isSaved(t) {
  if (!('caches' in window)) return false;
  const c = await caches.open('audio-v1');
  return !!(await c.match(abs(t.file)));
}
async function saveTrack(t) {
  const c = await caches.open('audio-v1');
  const r = await fetch(t.file, {cache: 'no-store'});
  if (!r.ok) throw new Error(r.status);
  await c.put(abs(t.file), r);
}

function renderCats() {
  const items = [['all', '전체'], ...Object.entries(CATS).map(([k, v]) => [k, v.emoji + ' ' + v.name])];
  $('#cats').innerHTML = items.map(([k, n]) => `<button data-c="${k}" class="${k === filter ? 'on' : ''}">${n}</button>`).join('');
  $('#cats').querySelectorAll('button').forEach(b => b.onclick = () => { filter = b.dataset.c; renderCats(); renderList(); });
}
async function renderList() {
  let html = '';
  for (const [k, c] of Object.entries(CATS)) {
    if (filter !== 'all' && filter !== k) continue;
    html += `<div class="cathead">${c.emoji} ${c.name}</div><div class="catdesc">${c.desc}</div>`;
    for (const t of tracks.filter(t => t.cat === k)) {
      html += `<button class="track" data-id="${t.id}"><span class="min">${t.minutes}<small>분</small></span>
        <span class="t">${t.title}<span class="s" id="s-${t.id}">${fmt(t.duration)}</span></span></button>`;
    }
  }
  $('#list').innerHTML = html;
  $('#list').querySelectorAll('.track').forEach(b => b.onclick = () => openTrack(tracks.find(t => t.id === b.dataset.id)));
  for (const t of tracks) if (await isSaved(t)) { const el = $('#s-' + t.id); if (el) el.textContent = fmt(t.duration) + ' · 저장됨 ✓'; }
}

function openTrack(t) {
  if (!current || current.id !== t.id) {
    current = t;
    audio.src = t.file;
    audio.load();
    $('#ptitle').textContent = t.title;
    $('#pcat').textContent = CATS[t.cat].name + ' · ' + t.minutes + '분';
    $('#rem').textContent = '-' + fmt(t.duration);
    $('#cur').textContent = '0:00'; $('#seek').value = 0;
    setMeta();
    isSaved(t).then(s => $('#save').textContent = s ? '✓ 저장됨' : '⬇ 오프라인 저장');
  }
  $('#home').hidden = true; $('#player').hidden = false;
  history.pushState({p: 1}, '');
  audio.play().catch(() => {});
}
function closePlayer() { $('#player').hidden = true; $('#home').hidden = false; }
$('#back').onclick = () => history.back();
window.onpopstate = () => { if (!$('#player').hidden) closePlayer(); };

function setMeta() {
  if (!('mediaSession' in navigator) || !current) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: current.title,
    artist: CATS[current.cat].name + ' · ' + current.minutes + '분',
    album: '쉼 · 명상',
    artwork: [{src: abs('icon-512.png'), sizes: '512x512', type: 'image/png'}, {src: abs('icon-192.png'), sizes: '192x192', type: 'image/png'}]
  });
}
function updatePos() {
  if (!('mediaSession' in navigator) || !audio.duration || !isFinite(audio.duration)) return;
  try { navigator.mediaSession.setPositionState({duration: audio.duration, playbackRate: audio.playbackRate, position: Math.min(audio.currentTime, audio.duration)}); } catch (e) {}
}
const skip = d => { audio.currentTime = Math.max(0, Math.min((audio.duration || 0) - 0.5, audio.currentTime + d)); updatePos(); };
if ('mediaSession' in navigator) {
  const ms = navigator.mediaSession;
  const h = (a, f) => { try { ms.setActionHandler(a, f); } catch (e) {} };
  h('play', () => audio.play());
  h('pause', () => audio.pause());
  h('stop', () => { audio.pause(); audio.currentTime = 0; });
  h('seekbackward', d => skip(-(d.seekOffset || 15)));
  h('seekforward', d => skip(d.seekOffset || 15));
  h('seekto', d => { if (d.fastSeek && audio.fastSeek) audio.fastSeek(d.seekTime); else audio.currentTime = d.seekTime; updatePos(); });
}

const orb = $('#orb');
function syncPlay() {
  const p = !audio.paused;
  $('#play').textContent = p ? '❚❚' : '▶';
  $('#play').classList.toggle('pause', p);
  orb.classList.toggle('breathe', p);
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = p ? 'playing' : 'paused';
}
audio.addEventListener('play', () => { syncPlay(); updatePos(); });
audio.addEventListener('pause', syncPlay);
audio.addEventListener('ended', () => { syncPlay(); audio.currentTime = 0; $('#dimmer').hidden = true; });
audio.addEventListener('loadedmetadata', updatePos);
let seeking = false;
audio.addEventListener('timeupdate', () => {
  const d = audio.duration || (current && current.duration) || 1;
  if (!seeking) $('#seek').value = Math.round(audio.currentTime / d * 1000);
  $('#cur').textContent = fmt(audio.currentTime);
  $('#rem').textContent = '-' + fmt(d - audio.currentTime);
});
$('#seek').addEventListener('input', () => { seeking = true; const d = audio.duration || current.duration; $('#cur').textContent = fmt($('#seek').value / 1000 * d); });
$('#seek').addEventListener('change', () => { const d = audio.duration || current.duration; audio.currentTime = $('#seek').value / 1000 * d; seeking = false; updatePos(); });
$('#play').onclick = () => audio.paused ? audio.play() : audio.pause();
$('#rew').onclick = () => skip(-15);
$('#fwd').onclick = () => skip(15);

$('#dim').onclick = () => { $('#dimmer').hidden = false; };
let lastTap = 0;
$('#dimmer').addEventListener('click', () => { const n = Date.now(); if (n - lastTap < 400) $('#dimmer').hidden = true; lastTap = n; });

$('#save').onclick = async () => {
  if (!current) return;
  $('#save').textContent = '저장 중…';
  try { await saveTrack(current); $('#save').textContent = '✓ 저장됨'; renderList(); }
  catch (e) { $('#save').textContent = '저장 실패, 다시 시도'; }
};
$('#dlall').onclick = async () => {
  const b = $('#dlall'); let i = 0;
  for (const t of tracks) {
    b.textContent = `저장 중 ${++i}/${tracks.length}…`;
    try { if (!(await isSaved(t))) await saveTrack(t); } catch (e) { b.textContent = '저장 실패, 다시 시도'; return; }
  }
  b.textContent = '전체 저장 완료 ✓'; renderList();
};

(async () => {
  tracks = await (await fetch('tracks.json')).json();
  renderCats(); renderList();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
})();
