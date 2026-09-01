// <Chip> reached as a BLOCK tag. Chips are normally inline (scanned out of prose
// by splitInline), so this path only fires for a chip that stands alone as its
// own paragraph — rare, but it should still render rather than disappear.
import { Chip } from '../Chip.tsx';
import { attr, type DocComponentProps } from '../DocRenderer.tsx';

export function ChipTag({ node }: DocComponentProps) {
  return (
    <Chip
      opcode={attr.str(node, 'opcode')}
      register={attr.str(node, 'register')}
      flag={attr.str(node, 'flag')}
      concept={attr.str(node, 'concept')}
    >
      {node.text}
    </Chip>
  );
}
