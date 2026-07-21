import config from '@aztec/foundation/eslint';

import { globalIgnores } from 'eslint/config';

export default [
  globalIgnores(['src/public/cdb/generated/**']),
  ...config,
  {
    files: ['src/public/avm/testing/account_proof_fetcher.ts'],
    rules: {
      camelcase: 'off',
      'no-console': 'off',
    },
  },
];
