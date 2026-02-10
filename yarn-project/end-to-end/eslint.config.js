import base from '@aztec/foundation/eslint';

import globals from 'globals';

export default [
  ...base,
  {
    files: ['**/*.mjs'],
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
    rules: {
      'no-console': 'off',
    },
  },
  {
    files: ['src/e2e_storage_proof/fixtures/storage_proof_fetcher.ts'],
    rules: {
      camelcase: 'off',
      'no-console': 'off',
    },
  },
];
