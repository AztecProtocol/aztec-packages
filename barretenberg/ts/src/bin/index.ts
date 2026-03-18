#!/usr/bin/env node
import { findBbBinary } from '../bb_backends/node/platform.js';
import { spawnSync } from 'node:child_process';

const bin = findBbBinary();

if (!bin) {
  console.error(
    'Could not find bb binary for your platform.\n' +
      'Ensure the platform-specific package is installed (e.g., @aztec/bb.js-linux-x64),\n' +
      'or build from source with: yarn build:native',
  );
  process.exit(1);
}

const result = spawnSync(bin, process.argv.slice(2), { stdio: 'inherit' });

process.exit(result.status ?? 1);
