#!/usr/bin/env node
import { findBbBinary } from '../bb_backends/node/platform.js';
import { spawnSync } from 'node:child_process';

const bin = findBbBinary();

if (!bin) {
  console.error('Could not find bb binary. Please ensure it is built and accessible.');
  process.exit(1);
}

const result = spawnSync(bin, process.argv.slice(2), { stdio: 'inherit' });

process.exit(result.status ?? 1);
