import config from '@aztec/foundation/eslint';

export default [
  ...config,
  {
    files: ['src/public/avm/opcodes/*.ts'],
    rules: {
      'require-await': 'off',
    },
  },
  {
    files: ['src/public/avm/fixtures/account_proof_fetcher.ts'],
    rules: {
      camelcase: 'off',
      'no-console': 'off',
    },
  },
];
