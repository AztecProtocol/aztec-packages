// Resolves the native bb shipped by the matching @aztec-foundation/bb-<platform> package.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const PLATFORM_PACKAGES = {
  'linux-x64': '@aztec-foundation/bb-linux-x64',
  'linux-arm64': '@aztec-foundation/bb-linux-arm64',
  'darwin-x64': '@aztec-foundation/bb-darwin-x64',
  'darwin-arm64': '@aztec-foundation/bb-darwin-arm64',
  'win32-x64': '@aztec-foundation/bb-win32-x64',
};

export const BINARY_ENV_VAR = 'BB_BINARY_PATH';

export function platformPackage() {
  return PLATFORM_PACKAGES[`${process.platform}-${process.arch}`] ?? null;
}

export function findBinary() {
  const override = process.env[BINARY_ENV_VAR];
  if (override) return override;
  const pkg = platformPackage();
  if (!pkg) return null;
  const file = process.platform === 'win32' ? 'bb.exe' : 'bb';
  const require = createRequire(import.meta.url);
  try {
    return path.join(path.dirname(require.resolve(pkg + '/package.json')), 'bin', file);
  } catch {
    // A checkout of this repository: the platform packages sit next to this file.
    const sibling = path.join(path.dirname(fileURLToPath(import.meta.url)), 'packages', pkg.split('/').pop(), 'bin', file);
    return fs.existsSync(sibling) ? sibling : null;
  }
}
