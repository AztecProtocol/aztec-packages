// HACK HACK HACK
// ts-jest currently doesn't support .cts files so we need this hack until this issue is closed
// https://github.com/kulshekhar/ts-jest/issues/3996
const constants = require('ts-jest/dist/constants');
constants.TS_TSX_REGEX = /\.[cm]?tsx?$/;
constants.JS_JSX_REGEX = /\.[cm]?jsx?$/;

/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest/presets/default-esm',
  moduleFileExtensions: ['js', 'ts', 'cts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.[cm]?js$': '$1',
  },
  transform: {
    // transform for .ts is handled by the preset above
    '^.+\\.cts$': ['ts-jest'],
  },
  testRegex: './src/.*\\.test\\.(js|mjs|ts)$',
  rootDir: './src',
  extensionsToTreatAsEsm: ['.ts'],
};
