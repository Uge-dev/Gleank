import js from '@eslint/js'
import globals from 'globals'
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
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // Gleank intentionally hydrates auth/cart data and API resources after mount.
      // These updates occur in controlled initialization effects.
      'react-hooks/set-state-in-effect': 'off',
      // Context modules export both providers and their companion hooks.
      'react-refresh/only-export-components': 'off',
    },
  },
])
