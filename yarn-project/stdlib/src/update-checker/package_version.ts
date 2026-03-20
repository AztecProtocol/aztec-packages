import { fileURLToPath } from '@aztec/foundation/url';

import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';

/** Returns the package version from the VERSION file, or undefined if not found. */
export function getPackageVersion(): string | undefined {
  try {
    const versionPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../VERSION');
    return readFileSync(versionPath, 'utf-8').trim();
  } catch {
    return undefined;
  }
}
