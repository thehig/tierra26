// <Chip> — the one canonical way to name a thing.
//
// Anywhere a document mentions an opcode, a register, a flag or a concept, it
// goes through this component, so the emoji, colour role and language mode are
// identical in prose, in the genome viewer, in a tooltip and on a Bible page.
// That consistency is the point: a learner should recognise `grow-a` as the same
// object whether they meet it in a sentence or as a block in the world.
//
// Hovering a chip opens the SAME card the genome viewer opens — not a browser
// title attribute. An opcode chip gets OpcodeTooltip verbatim; the other kinds
// get a card in the same shell, backed by the Bible page for that concept.
//
// Polymorphic on purpose — one tag with a target attribute beats four tags:
//   <Chip opcode="jmpb">top</Chip>   the instruction, with its label target
//   <Chip register="A"/>             a register, in the register palette
//   <Chip flag="Z"/>                 a CPU flag
//   <Chip concept="soup"/>           a concept, linking to its Bible page
//   <Chip concept="template">signpost</Chip>   ...said in the lesson's own word
import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { entry, entryOfMnemonic } from '@tierra26/genescript/vocab.ts';
import { opcodeEmoji } from '../anatomy/opcodeEmoji.ts';
import { OpcodeTooltip } from '../anatomy/OpcodeTooltip.tsx';
import { useHoverTip } from '../anatomy/useHoverTip.ts';
import { conceptBinding, conceptEmoji, simpleName } from '../design/bindings.ts';
import { REGISTERS, registerVar } from '../design/datasheet.ts';
import { categoryVar } from '../design/palette.ts';
import { useLanguageMode } from '../design/languageMode.tsx';
import { TokenTooltip } from './TokenTooltip.tsx';

export interface ChipProps {
  /** An engine mnemonic (incA) or its bound display name (grow-a). */
  opcode?: string;
  register?: string;
  flag?: string;
  concept?: string;
  /** The label/target text a control instruction points at, e.g. `top`. */
  children?: string;
}

/**
 * The visual shell every chip shares, plus the hover/focus behaviour. `card`
 * renders the tooltip for whichever kind of chip this is; it is only called
 * while the chip is actually hovered.
 */
function Chipped({
  color,
  emoji,
  name,
  target,
  label,
  card,
}: {
  color: string;
  emoji?: string;
  name: string;
  target?: string;
  label: string;
  card?: (anchor: { x: number; y: number }, keep: () => void, release: () => void) => ReactNode;
}) {
  const { anchor, show, hide, keep, close } = useHoverTip();
  const ref = useRef<HTMLSpanElement | null>(null);

  const open = () => {
    if (ref.current) show(ref.current.getBoundingClientRect(), undefined as void);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLSpanElement>) => {
    if (e.key === 'Escape') {
      close();
      e.currentTarget.blur();
    }
  };

  return (
    <>
      <span
        ref={ref}
        className="op-chip"
        style={{ color }}
        // Focusable so the card is reachable without a pointer, and dismissable
        // with Escape — the same contract the {term} keyword card honours.
        tabIndex={card ? 0 : undefined}
        aria-label={label}
        onMouseEnter={open}
        onMouseLeave={hide}
        onFocus={open}
        onBlur={hide}
        onKeyDown={onKeyDown}
      >
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
      {card && anchor ? card(anchor, keep, hide) : null}
    </>
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
    const name = advanced ? v.mnemonic : simpleName(v.verb);
    return (
      <Chipped
        color={categoryVar(v.category)}
        emoji={opcodeEmoji(v.verb)}
        name={name}
        target={target}
        label={`${name}${target ? ' ' + target : ''} — ${v.kid}`}
        card={(a, keep, release) => (
          <OpcodeTooltip gene={v.verb} x={a.x} y={a.y} onEnter={keep} onLeave={release} />
        )}
      />
    );
  }

  if (register) {
    // Each register keeps its own hue (the four --reg-* tokens the diagram's
    // notebook cards use) but shares the register glyph, so A in a sentence and
    // the A card in the diagram are recognisably the same object.
    const id = register.toUpperCase() as 'A' | 'B' | 'C' | 'D';
    const role = REGISTERS.find((r) => r.id === id)?.role ?? '';
    return (
      <Chipped
        color={registerVar(id)}
        emoji={conceptEmoji('register')}
        name={id}
        label={`register ${id} — ${role}`}
        card={(a, keep, release) => (
          <TokenTooltip
            title={`register ${id}`}
            color={registerVar(id)}
            kid={role}
            slug="register"
            anchor={a}
            onEnter={keep}
            onLeave={release}
          />
        )}
      />
    );
  }

  if (flag) {
    const id = flag.toUpperCase();
    const color = categoryVar(conceptBinding('flags')?.category ?? 'value');
    return (
      <Chipped
        color={color}
        emoji={conceptEmoji('flags')}
        name={id}
        label={`flag ${id}`}
        card={(a, keep, release) => (
          <TokenTooltip
            title={`flag ${id}`}
            color={color}
            slug="flags"
            anchor={a}
            onEnter={keep}
            onLeave={release}
          />
        )}
      />
    );
  }

  if (concept) {
    // Glyph and colour role come from the concept's own Bible frontmatter, so a
    // concept reads in the colour of what it is ABOUT — the save-pile is
    // register-coloured, flags are value-coloured — rather than every concept
    // sharing one hue. Not a link: the card carries the link, matching opcodes.
    const b = conceptBinding(concept);
    const color = categoryVar(b?.category ?? 'concept');
    const canonical = b?.name ?? concept;
    return (
      <Chipped
        color={color}
        emoji={conceptEmoji(concept)}
        name={target ?? canonical}
        // A lesson may say the concept in its own word — `signpost` for the
        // template. The accessible name then has to START with the word on
        // screen (WCAG 2.5.3) and still say what it really is, so a screen
        // reader hears "signpost — template concept".
        label={
          target && target !== canonical
            ? `${target} — ${canonical} concept`
            : `${canonical} — concept`
        }
        card={(a, keep, release) => (
          <TokenTooltip
            title={canonical}
            color={color}
            slug={concept}
            anchor={a}
            onEnter={keep}
            onLeave={release}
          />
        )}
      />
    );
  }

  // The validator rejects a target-less chip at build time; this is only the
  // runtime path a live authoring sandbox would hit mid-keystroke.
  return <code className="rt-code">chip?</code>;
}
