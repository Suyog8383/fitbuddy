import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default defineConfig(
  js.configs.recommended,
  tseslint.configs.recommended,
  prettier,
  {
    rules: {
      // `_name` = unused on purpose (e.g. Express error handler's `next`).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
    },
  },
);
