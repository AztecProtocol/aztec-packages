import { fileURLToPath } from '@aztec/foundation/url';

import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';

/** Returns the package version from the release-please manifest, or undefined if not found. */
export function getPackageVersion(): string | undefined {
  try {
    const releasePleaseManifestPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      '../../../../.release-please-manifest.json',
    );
    return JSON.parse(readFileSync(releasePleaseManifestPath).toString())['.'];
  } catch {
    return undefined;
  }
}
