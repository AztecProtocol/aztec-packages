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
 * Returns the precise Aztec stack version for embedding in contract artifacts.
 *
 * 1. AZTEC_VERSION env var (e.g. "5.0.0-nightly.20260414") — set by ci3/source_refname during CI release builds when
 *    the git tag is a valid semver.
 * 2. package.json version — when a developer installs the CLI (e.g. via aztec-up or npm) and runs `aztec compile`. The
 *    installed package.json carries the exact version.
 * 3. DEV_VERSION — local repo checkout during development (neither CI release nor npm install).
 */
export function getAztecVersion(): string {
  const aztecVersion = process.env.AZTEC_VERSION;
  if (aztecVersion) {
    return aztecVersion;
  }

  const dir = dirname(fileURLToPath(import.meta.url));

  // Fall back to the stdlib package.json version (works in npm-installed packages).
  try {
    const packageJsonPath = resolve(dir, '../../package.json');
    const version = JSON.parse(readFileSync(packageJsonPath).toString()).version;
    // 0.1.0 is the placeholder version in all monorepo package.json files during development. Published packages will
    // have the real version (e.g. 5.0.0-nightly.20260414).
    if (version && version !== '0.1.0') {
      return version;
    }
  } catch {
    // No package.json found.
  }

  return DEV_VERSION;
}
