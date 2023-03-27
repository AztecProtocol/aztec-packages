require('@rushstack/eslint-patch/modern-module-resolution');

module.exports = {
  extends: [require('@aztec/eslint-config')],
  parserOptions: { tsconfigRootDir: __dirname },
};
