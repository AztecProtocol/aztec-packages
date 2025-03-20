const { cwd } = require('process');
const { join } = require('path');
const { readFileSync } = require('fs');

// Loads the jest config from the package.json in the working directory and overrides the reporters.
// Note we cannot just use the `--reporters` CLI option because it does not allow setting options,
// and we need the `summaryThreshold` option to show actual errors when tests fail.
// This file is only used from the yarn project root `test` script.
/** @type {import('jest').Config} */
const config = {
  ...JSON.parse(readFileSync(join(cwd(), 'package.json'), 'utf-8')).jest,
  // CI-friendly reporters config
  reporters: [
    ['github-actions', { silent: false }],
    ['summary', { summaryThreshold: 0 }],
  ],
  // Override rootDir to the src of the current package
  rootDir: join(cwd(), 'src'),
};

module.exports = config;
