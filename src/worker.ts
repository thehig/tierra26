import { World, DEFAULT_CONFIG, type Config } from './engine/world.ts';
import { assemble, disassemble } from './engine/isa.ts';
import { ANCESTOR_ASM } from './engine/ancestor.ts';

const post = (msg: unknown, opts?: StructuredSerializeOptions & { transfer?: Transferable[] }) =>
  (self as unknown as { postMessage: (m: unknown, o?: unknown) => void }).postMessage(msg, opts);

let world = new World();
let running = false;
let instrPerTick = 20_000;
const TICK_MS = 16;
const FRAME_EVERY = 3; // post a frame every N ticks
let tickCount = 0;

const popHistory: { cycles: number; pop: number; genotypes: number }[] = [];

function liveGenotypeCount(): number {
  let n = 0;
  for (const g of world.genebank.values()) if (g.alive > 0) n++;
  return n;
}

function frame() {
  const orgs = [...world.organisms.values()].map(o => ({
    id: o.id, start: o.start, size: o.size, ip: o.ip,
    daughterStart: o.daughterStart, daughterSize: o.daughterSize,
    genotype: o.genotype,
  }));
  const genotypes = [...world.genebank.values()]
    .filter(g => g.alive > 0)
    .sort((a, b) => b.alive - a.alive)
    .slice(0, 14)
    .map(g => ({ hash: g.hash, size: g.size, alive: g.alive, totalBorn: g.totalBorn }));
  const soupCopy = world.soup.slice().buffer;
  post({
    type: 'frame',
    soup: soupCopy,
    orgs,
    stats: {
      cycles: world.cycles, pop: world.organisms.size,
      births: world.births, deaths: world.deaths,
      fullness: world.fullness(), genotypeCount: liveGenotypeCount(),
      genotypes,
      history: popHistory.slice(-240),
    },
  }, { transfer: [soupCopy] });
}

function tick() {
  if (running && world.organisms.size > 0) {
    world.run(instrPerTick);
    if (tickCount % 10 === 0) {
      popHistory.push({ cycles: world.cycles, pop: world.organisms.size, genotypes: liveGenotypeCount() });
      if (popHistory.length > 2_000) popHistory.splice(0, 1_000);
    }
  }
  if (tickCount % FRAME_EVERY === 0) frame();
  tickCount++;
}
setInterval(tick, TICK_MS);

function inspect(addr: number) {
  const org = world.organismAt(addr);
  if (!org) { post({ type: 'inspect', found: false, addr }); return; }
  const genome: number[] = [];
  for (let i = 0; i < org.size; i++) genome.push(world.soup[(org.start + i) % world.cfg.soupSize]);
  post({
    type: 'inspect', found: true, addr,
    org: {
      id: org.id, start: org.start, size: org.size, ip: org.ip,
      ax: org.ax, bx: org.bx, cx: org.cx, dx: org.dx,
      sp: org.sp, errors: org.errors, offspring: org.offspring,
      parentId: org.parentId, genotype: org.genotype,
      daughterStart: org.daughterStart, daughterSize: org.daughterSize,
      disasm: disassemble(genome, org.start),
    },
  });
}

(self as unknown as { onmessage: ((e: MessageEvent) => void) | null }).onmessage = (e: MessageEvent) => {
  const m = e.data;
  switch (m.type) {
    case 'init': {
      world = new World(m.cfg ?? {});
      popHistory.length = 0;
      const g = assemble(ANCESTOR_ASM);
      world.spawn(g);
      frame();
      break;
    }
    case 'reset': {
      const cfg: Partial<Config> = m.cfg ?? {};
      world = new World(cfg);
      popHistory.length = 0;
      if (m.seedAncestor !== false) world.spawn(assemble(ANCESTOR_ASM));
      frame();
      break;
    }
    case 'setRunning': running = !!m.on; break;
    case 'setSpeed': instrPerTick = Math.max(100, m.instrPerTick | 0); break;
    case 'setConfig': Object.assign(world.cfg, m.cfg); break;
    case 'inject': {
      try {
        const genome = assemble(m.src);
        const id = world.spawn(genome);
        post({ type: 'injected', ok: id > 0, size: genome.length, error: id > 0 ? null : 'no free space in soup' });
      } catch (err) {
        post({ type: 'injected', ok: false, error: String((err as Error).message ?? err) });
      }
      break;
    }
    case 'inspect': inspect(m.addr); break;
    case 'getGenotypeSource': {
      const g = world.genebank.get(m.hash);
      if (g) post({ type: 'genotypeSource', hash: m.hash, disasm: disassemble(g.sample) });
      break;
    }
  }
};

// default boot
world.spawn(assemble(ANCESTOR_ASM));
frame();
