#!/usr/bin/env node
import { findBbBinary } from '@aztec-foundation/bb.js-api';
import { spawnSync } from 'node:child_process';

const bin = findBbBinary();

if (!bin) {
  process.stderr.write('Could not find bb binary. Please ensure it is built and accessible.\n');
  process.exit(1);
}

const result = spawnSync(bin, process.argv.slice(2), { stdio: 'inherit' });

process.exit(result.status ?? 1);
