import { fileURLToPath } from '@aztec/foundation/url';

import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';

/** Returns the package version from the release-please manifest or the package.json, or undefined if not found. */
export function getPackageVersion(): string | undefined {
  const dir = dirname(fileURLToPath(import.meta.url));

  // Try the release-please manifest first (works in dev/repo checkout).
  try {
    const releasePleaseManifestPath = resolve(dir, '../../../../.release-please-manifest.json');
    return JSON.parse(readFileSync(releasePleaseManifestPath).toString())['.'];
  } catch {
    // Not in a repo checkout, fall through.
  }

  // Fall back to the stdlib package.json version (works in npm-installed packages).
  try {
    const packageJsonPath = resolve(dir, '../../package.json');
    const version = JSON.parse(readFileSync(packageJsonPath).toString()).version;
    if (version && version !== '0.1.0') {
      return version;
    }
  } catch {
    // No package.json found either.
  }

  return undefined;
}
