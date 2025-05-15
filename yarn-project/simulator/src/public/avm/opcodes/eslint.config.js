import config from '@aztec/foundation/eslint';

export default [
  ...config,
  {
    files: ['*.ts'],
    rules: {
      ...baseConfig.rules,
      'require-await': 'off',
    },
  },
];
