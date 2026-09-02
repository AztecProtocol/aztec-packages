#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { BINARY_ENV_VAR, findBinary, platformPackage } from './platform.js';

const binary = findBinary();
if (!binary) {
  const pkg = platformPackage();
  console.error(
    pkg
      ? `bb: native binary not found; install ${pkg} or set ${BINARY_ENV_VAR}.`
      : `bb: no prebuilt binary for ${process.platform}-${process.arch}; set ${BINARY_ENV_VAR} to a local build.`,
  );
  process.exit(1);
}
const result = spawnSync(binary, process.argv.slice(2), { stdio: 'inherit' });
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
