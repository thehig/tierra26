import { ANCESTOR_GS } from '@tierra26/genescript/ancestor.gs.ts';
import type { PlaygroundConfig } from '@tierra26/content/types.ts';
import { Playground } from '../playground/Playground.tsx';

// Module-level constant → stable identity, so the playground doesn't re-boot each render.
const SANDBOX_CONFIG: PlaygroundConfig = {
  scenario: 'soup-small',
  seed: 1,
  starter: { kind: 'genescript', source: ANCESTOR_GS },
  subset: { kind: 'classic32' },
};

export function SandboxPage({ dark }: { dark: boolean }) {
  return (
    <div className="page sandbox">
      <Playground config={SANDBOX_CONFIG} dark={dark} />
    </div>
  );
}
