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
 * 1. REF_NAME env var (e.g. "v5.0.0-nightly.20260414") — set during CI release builds when bootstrap.sh compiles
 *    contracts before publishing npm packages.
 * 2. package.json version — when a developer installs the CLI (e.g. via aztec-up or npm) and runs `aztec compile`. The
 *    installed package.json carries the exact version.
 * 3. DEV_VERSION — local repo checkout during development (neither CI release nor npm install).
 */
export function getAztecVersion(): string {
  // Use the git tag version (e.g. 5.0.0-nightly.20260414) when available in CI release builds.
  const refName = process.env.REF_NAME;
  if (refName?.startsWith('v')) {
    return refName.slice(1);
  }

  const dir = dirname(fileURLToPath(import.meta.url));

  // Fall back to the stdlib package.json version (works in npm-installed packages).
  try {
    const packageJsonPath = resolve(dir, '../../package.json');
    const version = JSON.parse(readFileSync(packageJsonPath).toString()).version;
    if (version && version !== '0.1.0') {
      return version;
    }
  } catch {
    // No package.json found.
  }

  return DEV_VERSION;
}
