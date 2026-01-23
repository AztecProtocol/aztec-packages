import { fileURLToPath } from '@aztec/foundation/url';

import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';

export const getCliVersion = () => {
  const packageJsonPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../package.json');
  const cliVersion: string = JSON.parse(readFileSync(packageJsonPath).toString()).version;

  // If the version is 0.1.0, this is a placeholder version and we are in a docker container; query release please for the latest version
  if (cliVersion === '0.1.0') {
    const releasePleasePath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      '../../../../.release-please-manifest.json',
    );
    const releaseVersion = JSON.parse(readFileSync(releasePleasePath).toString())['.'];
    return releaseVersion;
  }

  return cliVersion;
};
