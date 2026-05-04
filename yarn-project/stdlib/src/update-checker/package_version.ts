import { fileURLToPath } from '@aztec/foundation/url';

import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';

/** Placeholder version returned when running from a local monorepo checkout rather than an npm-installed package. */
export const DEV_VERSION = 'dev';

/**
 * Returns the package version from the stdlib `package.json`, or `DEV_VERSION` when the version is the `0.1.0`
 * placeholder (which indicates a local monorepo checkout rather than an npm-installed package).
 */
export function getPackageVersion(): string {
  const dir = dirname(fileURLToPath(import.meta.url));
  const packageJsonPath = resolve(dir, '../../package.json');
  const version = JSON.parse(readFileSync(packageJsonPath).toString()).version;
  return version === '0.1.0' ? DEV_VERSION : version;
}

/**
 * Fallback version used when compiling contracts from a local repo checkout rather than from a published release. Both
 * CI release builds (via REF_NAME) and npm-installed packages (via package.json) will have a real version.
 */
export const DEV_VERSION = 'dev';

/**
 * Returns the Aztec stack version for embedding in contract artifacts.
 *
 * 1. package.json version — when a developer installs the CLI (e.g. via aztec-up or npm) and runs `aztec compile`. The
 *    installed package.json carries the exact version.
 * 2. DEV_VERSION — local repo checkout during development (no npm install).
 */
export function getAztecVersion(): string {
  const dir = dirname(fileURLToPath(import.meta.url));
  const packageJsonPath = resolve(dir, '../../package.json');
  const version = JSON.parse(readFileSync(packageJsonPath).toString()).version;
  // 0.1.0 is the placeholder version in all monorepo package.json files during development. Published packages will
  // have the real version (e.g. 5.0.0-nightly.20260414).
  return version === '0.1.0' ? DEV_VERSION : version;
}
