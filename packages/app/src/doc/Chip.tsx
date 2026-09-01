// <Chip> — the one canonical way to name a thing.
//
// Anywhere a document mentions an opcode, a register, a flag or a concept, it
// goes through this component, so the emoji, colour role and language mode are
// identical in prose, in the genome viewer, in a tooltip and on a Bible page.
// That consistency is the point: a learner should recognise `grow-a` as the same
// object whether they meet it in a sentence or as a block in the world.
//
// Polymorphic on purpose — one tag with a target attribute beats four tags:
//   <Chip opcode="jmpb">top</Chip>   the instruction, with its label target
//   <Chip register="A"/>             a register, in the register palette
//   <Chip flag="Z"/>                 a CPU flag
//   <Chip concept="soup"/>           a concept, linking to its Bible page
import { entry, entryOfMnemonic } from '@tierra26/genescript/vocab.ts';
import { opcodeEmoji } from '../anatomy/opcodeEmoji.ts';
import { simpleName } from '../design/bindings.ts';
import { registerVar } from '../design/datasheet.ts';
import { categoryVar } from '../design/palette.ts';
import { useLanguageMode } from '../design/languageMode.tsx';
import { Link } from '../router/router.tsx';

export interface ChipProps {
  /** An engine mnemonic (incA) or its bound display name (grow-a). */
  opcode?: string;
  register?: string;
  flag?: string;
  concept?: string;
  /** The label/target text a control instruction points at, e.g. `top`. */
  children?: string;
}

/** The visual shell every chip shares, so all four kinds line up in a sentence. */
function Shell({
  color,
  emoji,
  name,
  target,
  title,
}: {
  color: string;
  emoji?: string;
  name: string;
  target?: string;
  title?: string;
}) {
  return (
    <span className="op-chip" style={{ color }} title={title}>
      {emoji && (
        <span className="op-chip-emoji" aria-hidden="true">
          {emoji}
        </span>
      )}
      <span className="op-chip-name">
        {name}
        {target ? <span className="op-chip-target"> {target}</span> : null}
      </span>
    </span>
  );
}

export function Chip({ opcode, register, flag, concept, children }: ChipProps) {
  const advanced = useLanguageMode() === 'advanced';
  const target = children?.trim() || undefined;

  if (opcode) {
    // Docs author in real mnemonics, but accept the display name too, so a
    // hand-written `<Chip opcode="grow-a"/>` still resolves.
    const v = entryOfMnemonic(opcode) ?? entry(opcode);
    if (!v) return <code className="rt-code">{opcode}</code>;
    return (
      <Shell
        color={categoryVar(v.category)}
        emoji={opcodeEmoji(v.verb)}
        name={advanced ? v.mnemonic : simpleName(v.verb)}
        target={target}
        title={advanced ? v.machine : v.kid}
      />
    );
  }

  if (register) {
    const id = register.toUpperCase();
    return <Shell color={registerVar(id as 'A' | 'B' | 'C' | 'D')} name={id} title={`register ${id}`} />;
  }

  if (flag) {
    const id = flag.toUpperCase();
    return <Shell color={categoryVar('value')} name={id} title={`flag ${id}`} />;
  }

  if (concept) {
    return (
      <span className="op-chip chip-link" style={{ color: categoryVar('concept') }}>
        <Link to={{ surface: 'concept', slug: concept }} className="op-chip-name">
          {target ?? concept}
        </Link>
      </span>
    );
  }

  // The validator rejects a target-less chip at build time; this is only the
  // runtime path a live authoring sandbox would hit mid-keystroke.
  return <code className="rt-code">chip?</code>;
}
