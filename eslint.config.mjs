import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
  { ignores: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.next/**', '**/coverage/**'] },
  js.configs.recommended,
  {
    files: ['apps/api/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: globals.node,
    },
    rules: {
      // Express identifies error handlers by their four arguments, so an unused `next` is required.
      'no-unused-vars': ['error', { argsIgnorePattern: '^next$' }],
    },
  },
  prettier,
];
