import { fileURLToPath } from '@aztec/foundation/url';

import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';

import { DEV_VERSION } from './dev_version.js';

/**
 * Returns the package version from the foundation `package.json`, or `DEV_VERSION` when the version is the `0.1.0`
 * placeholder (which indicates a local monorepo checkout rather than an npm-installed package).
 */
export function getPackageVersion(): string {
  const dir = dirname(fileURLToPath(import.meta.url));
  const packageJsonPath = resolve(dir, '../../package.json');
  const version = JSON.parse(readFileSync(packageJsonPath).toString()).version;
  return version === '0.1.0' ? DEV_VERSION : version;
}
