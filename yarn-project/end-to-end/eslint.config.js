import base from '@aztec/foundation/eslint';

import { globalIgnores } from 'eslint/config';
import globals from 'globals';

export default [
  ...base,
  // The timing test environment is loaded by jest at runtime from source (not compiled into dest),
  // and imports foundation's env across packages, so it is excluded from the TS project. Ignore it
  // from linting too, matching how foundation ignores its own src/jest/*.mjs env files.
  globalIgnores(['src/shared/timing_env.mjs']),
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
    files: ['src/automine/contracts/fixtures/storage_proof_fetcher.ts'],
    rules: {
      camelcase: 'off',
      'no-console': 'off',
    },
  },
];
