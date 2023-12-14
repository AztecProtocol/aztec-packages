import type { Config } from 'jest';

const config: Config = {
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.[cm]?js$': '$1',
  },
  extensionsToTreatAsEsm: ['.ts'],
  moduleFileExtensions: ['js', 'ts', 'cts'],
  testRegex: './src/.*\\.test\\.(js|mjs|ts)$',
  rootDir: './src',
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
      },
    ],
  },
};

export default config;
