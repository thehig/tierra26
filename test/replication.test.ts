import { assemble, disassemble } from '../src/engine/isa.ts';
import { ANCESTOR_ASM } from '../src/engine/ancestor.ts';
import { World } from '../src/engine/world.ts';

function assert(cond: boolean, msg: string) {
  if (!cond) { console.error('FAIL:', msg); process.exit(1); }
  console.log('ok:', msg);
}

const genome = assemble(ANCESTOR_ASM);
console.log(`ancestor: ${genome.length} bytes`);
console.log(disassemble(genome).split('\n').slice(0, 6).join('\n'), '\n...');

// 1. sterile world: no mutation — ancestor must breed true
{
  const w = new World({ copyMutRate: 0, cosmicMutRate: 0, seed: 7 });
  const id = w.spawn(genome);
  assert(id > 0, 'ancestor spawned');
  w.run(20_000);
  assert(w.births > 5, `population grew without mutation (births=${w.births}, pop=${w.organisms.size})`);
  assert(w.genebank.size === 1, `breeds true: exactly 1 genotype (got ${w.genebank.size})`);
}

// 2. long sterile run: population must saturate and stay stable under the reaper
{
  const w = new World({ copyMutRate: 0, cosmicMutRate: 0, seed: 11 });
  w.spawn(genome);
  w.run(2_000_000);
  const pop = w.organisms.size;
  assert(pop > 100, `soup saturates (pop=${pop}, births=${w.births}, deaths=${w.deaths})`);
  assert(w.deaths > 0, `reaper works (deaths=${w.deaths})`);
}

// 3. mutation on: new genotypes must appear
{
  const w = new World({ seed: 3 });
  w.spawn(genome);
  w.run(3_000_000);
  const genotypesBorn = [...w.genebank.values()].filter(g => g.totalBorn > 0).length;
  const sizes = new Set([...w.genebank.values()].filter(g => g.alive > 0).map(g => g.size));
  console.log(`   genotypes ever born: ${genotypesBorn}, live size classes: ${[...sizes].join(',')}`);
  assert(genotypesBorn > 3, `evolution produces variant genotypes (got ${genotypesBorn})`);
  assert(w.organisms.size > 50, `evolving population survives (pop=${w.organisms.size})`);
}

console.log('\nALL TESTS PASSED');
