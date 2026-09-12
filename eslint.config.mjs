import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  // .web-ext-profile is a Firefox profile, not our source.
  { ignores: ['dist/**', 'web-ext-artifacts/**', 'node_modules/**', '.web-ext-profile/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.webextensions,
      },
    },
    rules: {
      'no-console': ['warn', { allow: ['info', 'warn', 'error', 'debug'] }],
    },
  },
  {
    rules: {
      // A leading underscore marks an argument kept for its position, not its value.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['*.mjs', 'test/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
  },
  prettier,
)
