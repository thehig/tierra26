import './style.css';
import { ANCESTOR_ASM } from './engine/ancestor.ts';
import { INSTRUCTIONS } from './engine/isa.ts';
import SimWorker from './worker.ts?worker';

const worker = new SimWorker();

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

// ---------- state ----------
interface OrgLite { id: number; start: number; size: number; ip: number; daughterStart: number; daughterSize: number; genotype: string }
let lastFrame: { soup: Uint8Array; orgs: OrgLite[]; stats: any } | null = null;
let running = false;
let inspectedId: number | null = null;
let soupSize = 60_000;

// genotype -> stable color
const colorCache = new Map<string, [number, number, number]>();
function genoColor(hash: string): [number, number, number] {
  let c = colorCache.get(hash);
  if (c) return c;
  let h = 0;
  for (let i = 0; i < hash.length; i++) h = (Math.imul(h, 31) + hash.charCodeAt(i)) >>> 0;
  const hue = h % 360, sat = 0.62, lit = 0.58;
  c = hslToRgb(hue, sat, lit);
  colorCache.set(hash, c);
  return c;
}
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}

// ---------- soup canvas ----------
const canvas = $('#soup') as unknown as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
let cols = 300, rows = 200;
let img: ImageData | null = null;
let off: HTMLCanvasElement | null = null;

function layoutCanvas() {
  cols = 300;
  rows = Math.ceil(soupSize / cols);
  off = document.createElement('canvas');
  off.width = cols; off.height = rows;
  img = off.getContext('2d')!.createImageData(cols, rows);
}
layoutCanvas();

function drawSoup() {
  if (!lastFrame || !img || !off) return;
  const { soup, orgs } = lastFrame;
  const d = img.data;
  // base layer: dead code as dim noise
  for (let i = 0; i < soupSize; i++) {
    const v = soup[i];
    const g = 22 + (v % 8) * 3;
    const j = i * 4;
    d[j] = g - 6; d[j + 1] = g + 2; d[j + 2] = g - 4; d[j + 3] = 255;
  }
  // owned cells
  for (const o of orgs) {
    const [r, g, b] = genoColor(o.genotype);
    for (let i = 0; i < o.size; i++) {
      const j = ((o.start + i) % soupSize) * 4;
      d[j] = r; d[j + 1] = g; d[j + 2] = b;
    }
    if (o.daughterStart >= 0) {
      for (let i = 0; i < o.daughterSize; i++) {
        const j = ((o.daughterStart + i) % soupSize) * 4;
        d[j] = r * 0.45; d[j + 1] = g * 0.45; d[j + 2] = b * 0.45;
      }
    }
  }
  // instruction pointers
  for (const o of orgs) {
    const j = (((o.ip % soupSize) + soupSize) % soupSize) * 4;
    d[j] = 255; d[j + 1] = 255; d[j + 2] = 255;
  }
  off.getContext('2d')!.putImageData(img, 0, 0);
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
}

canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor(((e.clientX - rect.left) / rect.width) * cols);
  const y = Math.floor(((e.clientY - rect.top) / rect.height) * rows);
  const addr = y * cols + x;
  if (addr < soupSize) worker.postMessage({ type: 'inspect', addr });
});

// ---------- chart ----------
const chart = $('#chart') as unknown as HTMLCanvasElement;
function drawChart() {
  if (!lastFrame) return;
  const hist: { cycles: number; pop: number; genotypes: number }[] = lastFrame.stats.history;
  const c = chart.getContext('2d')!;
  const W = (chart.width = chart.clientWidth), H = (chart.height = 120);
  c.clearRect(0, 0, W, H);
  if (hist.length < 2) return;
  const maxPop = Math.max(...hist.map(p => p.pop), 10);
  const maxG = Math.max(...hist.map(p => p.genotypes), 5);
  const px = (i: number) => (i / (hist.length - 1)) * (W - 2) + 1;
  const line = (get: (p: any) => number, max: number, color: string) => {
    c.beginPath();
    hist.forEach((p, i) => {
      const y = H - 4 - (get(p) / max) * (H - 10);
      i ? c.lineTo(px(i), y) : c.moveTo(px(i), y);
    });
    c.strokeStyle = color; c.lineWidth = 1.5; c.stroke();
  };
  line(p => p.pop, maxPop, '#e3b24b');
  line(p => p.genotypes, maxG, '#7fa88f');
  c.fillStyle = '#8b9c91'; c.font = '10px IBM Plex Mono, monospace';
  c.fillText(`— organisms (max ${maxPop})`, 6, 12);
  c.fillStyle = '#7fa88f';
  c.fillText(`— genotypes (max ${maxG})`, 6, 24);
}

// ---------- stats + genotype table ----------
const fmt = (n: number) => n.toLocaleString('en-US');
function updateStats() {
  if (!lastFrame) return;
  const s = lastFrame.stats;
  $('#stCycles').textContent = s.cycles > 1e6 ? (s.cycles / 1e6).toFixed(1) + 'M' : fmt(s.cycles);
  $('#stPop').textContent = fmt(s.pop);
  $('#stGeno').textContent = fmt(s.genotypeCount);
  $('#stBirths').textContent = fmt(s.births);
  $('#stDeaths').textContent = fmt(s.deaths);
  $('#stFull').textContent = Math.round(s.fullness * 100) + '%';

  const tbody = $('#genoTable tbody');
  tbody.innerHTML = '';
  for (const g of s.genotypes) {
    const [r, gg, b] = genoColor(g.hash);
    const tr = document.createElement('tr');
    tr.className = 'clickable';
    tr.title = 'Open this genotype in the editor';
    tr.innerHTML = `<td class="swatch"><span style="background:rgb(${r},${gg},${b})"></span></td>` +
      `<td>${g.hash}</td><td>${g.size}</td><td>${g.alive}</td><td>${g.totalBorn}</td>`;
    tr.addEventListener('click', () => worker.postMessage({ type: 'getGenotypeSource', hash: g.hash }));
    tbody.appendChild(tr);
  }
}

// ---------- inspector ----------
function showInspector(m: any) {
  activateTab('inspector');
  const empty = $('#inspectorEmpty'), body = $('#inspectorBody');
  if (!m.found) {
    empty.hidden = false; body.hidden = true;
    empty.textContent = `Address ${m.addr}: dead code — no organism owns this byte.`;
    inspectedId = null;
    return;
  }
  inspectedId = m.org.id;
  empty.hidden = true; body.hidden = false;
  const o = m.org;
  $('#inspectorMeta').innerHTML =
    `<span>organism <b>#${o.id}</b></span><span>genotype <b>${o.genotype}</b></span>` +
    `<span>cell <b>${o.start}–${o.start + o.size - 1}</b> (${o.size} B)</span>` +
    `<span>ip <b>${o.ip}</b></span>` +
    `<span>ax <b>${o.ax}</b> bx <b>${o.bx}</b></span><span>cx <b>${o.cx}</b> dx <b>${o.dx}</b></span>` +
    `<span>errors <b>${o.errors}</b></span><span>offspring <b>${o.offspring}</b></span>` +
    `<span>parent <b>#${o.parentId}</b></span>` +
    (o.daughterStart >= 0 ? `<span>daughter <b>${o.daughterStart} (${o.daughterSize} B)</b></span>` : '');
  const pre = $('#inspectorDisasm');
  pre.innerHTML = o.disasm.split('\n').map((ln: string) => {
    const addr = parseInt(ln, 10);
    return addr === o.ip ? `<span class="ipline">${ln}  ◀ ip</span>` : ln;
  }).join('\n');
}

// ---------- tabs ----------
function activateTab(name: string) {
  document.querySelectorAll('#tabs button').forEach(b =>
    b.classList.toggle('active', (b as HTMLElement).dataset.tab === name));
  document.querySelectorAll('.tab').forEach(t =>
    t.classList.toggle('active', t.id === 'tab-' + name));
}
document.querySelectorAll('#tabs button').forEach(b =>
  b.addEventListener('click', () => activateTab((b as HTMLElement).dataset.tab!)));

// ---------- editor ----------
const editor = $('#editorSrc') as unknown as HTMLTextAreaElement;
editor.value = ANCESTOR_ASM.trim();
$('#isaRef').textContent = INSTRUCTIONS.map((m, i) => `${String(i).padStart(2)} ${m}`).join('\n');
$('#injectBtn').addEventListener('click', () => worker.postMessage({ type: 'inject', src: editor.value }));
$('#loadAncestorBtn').addEventListener('click', () => { editor.value = ANCESTOR_ASM.trim(); });
function editorMsg(text: string, ok: boolean) {
  const el = $('#editorMsg');
  el.textContent = text;
  el.className = ok ? 'ok' : 'err';
}

// ---------- toolbar ----------
const runBtn = $('#runBtn');
runBtn.addEventListener('click', () => {
  running = !running;
  runBtn.textContent = running ? 'Pause' : 'Run';
  runBtn.classList.toggle('primary', !running);
  worker.postMessage({ type: 'setRunning', on: running });
});
$('#resetBtn').addEventListener('click', () => resetWorld());

const speed = $('#speed') as unknown as HTMLInputElement;
function applySpeed() {
  const perSec = Math.round(10 ** parseFloat(speed.value));
  $('#speedLabel').textContent = perSec >= 1e6 ? (perSec / 1e6).toFixed(1) + 'M i/s' : fmt(perSec) + ' i/s';
  worker.postMessage({ type: 'setSpeed', instrPerTick: Math.max(100, Math.round(perSec / 60)) });
}
speed.addEventListener('input', applySpeed);
applySpeed();

// ---------- settings ----------
$('#settingsForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = new FormData(e.target as HTMLFormElement);
  const div = (k: string) => { const v = Number(f.get(k)); return v > 0 ? 1 / v : 0; };
  worker.postMessage({
    type: 'setConfig',
    cfg: {
      copyMutRate: div('copyMutDiv'),
      cosmicMutRate: div('cosmicMutDiv'),
      sliceSize: Number(f.get('sliceSize')) || 24,
      reaperThreshold: Number(f.get('reaperThreshold')) || 0.8,
    },
  });
});
$('#resetForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = new FormData(e.target as HTMLFormElement);
  soupSize = Number(f.get('soupSize')) || 60_000;
  resetWorld({ soupSize, seed: Number(f.get('seed')) || 42 });
});
function resetWorld(cfg: Record<string, number> = {}) {
  worker.postMessage({ type: 'reset', cfg });
  if ('soupSize' in cfg) { layoutCanvas(); }
  colorCache.clear();
  inspectedId = null;
  $('#inspectorEmpty').hidden = false;
  $('#inspectorBody').hidden = true;
  ($('#inspectorEmpty')).textContent = 'Click a coloured region of the soup to open an organism.';
}

// ---------- worker messages ----------
worker.onmessage = (e: MessageEvent) => {
  const m = e.data;
  if (m.type === 'frame') {
    lastFrame = { soup: new Uint8Array(m.soup), orgs: m.orgs, stats: m.stats };
    soupSize = lastFrame.soup.length;
    if (!off || cols * rows < soupSize) layoutCanvas();
    drawSoup(); drawChart(); updateStats();
    if (inspectedId !== null && running) {
      const still = m.orgs.find((o: OrgLite) => o.id === inspectedId);
      if (!still) {
        inspectedId = null;
        $('#inspectorEmpty').hidden = false;
        $('#inspectorBody').hidden = true;
        $('#inspectorEmpty').textContent = 'That organism died. Click another.';
      }
    }
  } else if (m.type === 'inspect') {
    showInspector(m);
  } else if (m.type === 'injected') {
    editorMsg(m.ok ? `Injected — ${m.size} bytes now live in the soup.` : `Failed: ${m.error}`, m.ok);
  } else if (m.type === 'genotypeSource') {
    activateTab('editor');
    editor.value = `; genotype ${m.hash} (disassembled from the genebank)\n` +
      m.disasm.split('\n').map((l: string) => l.trim().split(/\s+/)[1] ?? '').join('\n');
    editorMsg(`Loaded genotype ${m.hash} into the editor.`, true);
  }
};

worker.postMessage({ type: 'init' });
