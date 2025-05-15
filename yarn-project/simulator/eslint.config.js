import config from '@aztec/foundation/eslint';

export default [
  ...config,
  {
    files: ['src/public/avm/opcodes/*.ts'],
    rules: {
      'require-await': 'off',
    },
  },
];
