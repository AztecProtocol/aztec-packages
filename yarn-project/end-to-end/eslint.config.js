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
];
