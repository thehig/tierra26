// Anatomy/OpcodeTooltip — the opcode-definition tooltip in isolation. It normally floats fixed at a
// hovered row; these stories pin it into normal flow (a scoped `position: static`) so the card and its
// "what changes" badges can be inspected directly, one story per opcode kind plus a gallery.
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { OpcodeTooltip } from './OpcodeTooltip.tsx';

// lay the fixed tooltip into the document so it can be seen and laid out beside its siblings
const flow = <style>{`.op-tip{position:static!important;}`}</style>;

const meta = {
  title: 'Anatomy/OpcodeTooltip',
  component: OpcodeTooltip,
  parameters: { layout: 'centered' },
  decorators: [(Story) => (<div style={{ padding: 24 }}>{flow}<Story /></div>)],
} satisfies Meta<typeof OpcodeTooltip>;
export default meta;
type Story = StoryObj<typeof meta>;

const at = (gene: string) => ({ gene, x: 0, y: 0 });

// register maths — "sets C", the classic counting-box change
export const Subtract: Story = {
  args: at('subtract'),
  play: async ({ canvasElement: c }) => {
    await expect(c.querySelector('.op-tip-name')!.textContent).toBe('subtract');
    await expect(c.querySelector('.op-tip-machine')!.textContent).toContain('C := A');
    await expect(c.querySelectorAll('.op-badge').length).toBeGreaterThan(0);
  },
};

// a counter step — grows a register by one
export const GrowA: Story = { args: at('grow-a') };

// a branch — "may skip the next line"
export const IfZero: Story = { args: at('if-zero') };

// control flow — moves the reading head to a landmark
export const JumpBack: Story = { args: at('jump-back') };

// the save-pile — pushes a value
export const SaveC: Story = { args: at('save-c') };

// reproduction — makes a daughter
export const MakeSpace: Story = { args: at('make-space') };

// the risky one the analysis flagged — writes a cell (and can mutate)
export const CopyByte: Story = {
  args: at('copy-byte'),
  play: async ({ canvasElement: c }) => {
    await expect(c.querySelector('.op-tip-name')!.textContent).toBe('copy-byte');
    await expect(c.querySelector('.op-tip-watch')).toBeTruthy(); // a "watch out" pitfall
  },
};

// a raw template mark — nop1 (raw blocks resolve to the same page)
export const Nop: Story = { args: at('mark-1') };

// the whole spread, so the badge vocabulary reads as one system
export const Gallery: Story = {
  args: at('subtract'),
  render: () => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, maxWidth: 980 }}>
      {flow}
      {['grow-a', 'subtract', 'flip-bit', 'if-zero', 'jump-back', 'call', 'save-c', 'load-c', 'find', 'make-space', 'divide', 'copy-byte']
        .map((g) => <OpcodeTooltip key={g} gene={g} x={0} y={0} />)}
    </div>
  ),
  play: async ({ canvasElement: c }) => {
    // every card renders a name and at least one "what changes" badge
    const names = c.querySelectorAll('.op-tip-name');
    await expect(names.length).toBe(12);
    await expect(c.querySelectorAll('.op-badge').length).toBeGreaterThan(names.length);
  },
};
