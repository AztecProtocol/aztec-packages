const baseConfig = require('@aztec/foundation/eslint');

const e2eConfig = {
  overrides: [
    {
      files: ['*.ts'],
    },
  ],
};

module.exports = {
  ...baseConfig,
  overrides: [...baseConfig.overrides, ...e2eConfig.overrides],
};
