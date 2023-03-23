require('@rushstack/eslint-patch/modern-module-resolution');

module.exports = {
  extends: ['@aztec/eslint-config'],
  parserOptions: { tsconfigRootDir: __dirname },
  rules: {
    "jsdoc/require-jsdoc": "off",
    "jsdoc/require-param": "off"
  }
};
