import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const currentDir = dirname(fileURLToPath(import.meta.url));

const { name } = JSON.parse(readFileSync(join(currentDir, '../package.json')));
const versionManifest = JSON.parse(readFileSync(join(currentDir, '../../../.release-please-manifest.json')));
const version = versionManifest['.'];

writeFileSync(
  join(currentDir, '../src/config/package_info.ts'),
  `export function getPackageInfo() {
  return { version: '${version}', name: '${name}' };
}
`,
);
