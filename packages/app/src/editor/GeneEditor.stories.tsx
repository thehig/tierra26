// Editor/GeneEditor — the code editor under the language mode. In simple it shows friendly GeneScript;
// in advanced it shows/edits the real mnemonics (grow-a ⇄ incA) while the compiled program is the same.
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor } from 'storybook/test';
import { useState } from 'react';
import { GeneEditor } from './GeneEditor.tsx';
import { LanguageModeFixed, type LanguageMode } from '../design/languageMode.tsx';

function Host({ mode }: { mode: LanguageMode }) {
  const [v, setV] = useState('grow-a\ngrow-b\nsubtract');
  return (
    <LanguageModeFixed mode={mode}>
      <div style={{ maxWidth: 520, padding: 16 }}><GeneEditor value={v} onChange={setV} title="Gene editor" /></div>
    </LanguageModeFixed>
  );
}

const meta = {
  title: 'Editor/GeneEditor',
  component: Host,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Host>;
export default meta;
type Story = StoryObj<typeof meta>;

const content = (c: HTMLElement) => c.querySelector('.cm-content')?.textContent ?? '';

// friendly GeneScript, verbatim
export const Simple: Story = {
  args: { mode: 'simple' },
  play: async ({ canvasElement: c }) => {
    await waitFor(() => expect(content(c)).toContain('grow-a'));
    await expect(content(c)).not.toContain('incA');
  },
};

// advanced: the same program shown as real mnemonics (grow-a → incA, subtract → subCAB)
export const Advanced: Story = {
  args: { mode: 'advanced' },
  play: async ({ canvasElement: c }) => {
    await waitFor(() => expect(content(c)).toContain('incA'));
    await expect(content(c)).toContain('subCAB');
    await expect(content(c)).not.toContain('grow-a');
  },
};
