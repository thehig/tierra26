import type { Preview } from '@storybook/react-vite'
import '../src/design/tokens.css' // CSS custom properties (--ink, --surface, --accent…) — must load first
import '../src/styles.css'
import { LanguageModeFixed, type LanguageMode } from '../src/design/languageMode.tsx'

const preview: Preview = {
  // A global toolbar toggle drives the same simple/advanced language mode the app uses, so every story
  // (genome viewer, datasheet, tooltip, editor) flips between friendly names and real mnemonics.
  globalTypes: {
    lang: {
      description: 'Language mode',
      toolbar: {
        title: 'Language',
        icon: 'book',
        items: [{ value: 'simple', title: 'Simple' }, { value: 'advanced', title: 'Advanced' }],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { lang: 'simple' },
  decorators: [
    (Story, ctx) => (
      <LanguageModeFixed mode={(ctx.globals.lang as LanguageMode) ?? 'simple'}><Story /></LanguageModeFixed>
    ),
  ],
  parameters: {
    controls: {
      matchers: {
       color: /(background|color)$/i,
       date: /Date$/i,
      },
    },

    a11y: {
      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: 'todo'
    }
  },
};

export default preview;
