import js from '@eslint/js'
import globals from 'globals'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      jsxA11y.flatConfigs.recommended,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // `role` is also an ordinary prop name on our own components (RequireRole)
      'jsx-a11y/aria-role': ['error', { ignoreNonDOM: true }],
      // deprecated rule that rejects valid htmlFor/nesting; the modern
      // label-has-associated-control below covers the same ground correctly
      'jsx-a11y/label-has-for': 'off',
      'jsx-a11y/label-has-associated-control': 'error',
      // dialogs and the login form place initial focus on purpose
      'jsx-a11y/no-autofocus': 'off',
    },
  },
])
