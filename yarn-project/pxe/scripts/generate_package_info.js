import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const currentDir = dirname(fileURLToPath(import.meta.url));

const { name } = JSON.parse(readFileSync(join(currentDir, '../package.json')));

let version = '0.0.0';
try {
  // In Docker, VERSION is written by the Dockerfile at build time
  version = readFileSync(join(currentDir, '../../../VERSION'), 'utf-8').trim();
} catch {
  try {
    // In dev/CI, derive from git tags
    const tag = execSync("git describe --tags --match 'v[0-9]*' --abbrev=0 2>/dev/null", { encoding: 'utf-8' }).trim();
    version = tag.replace(/^v/, '').replace(/-.*/, '');
  } catch {
    // fallback
  }
}

writeFileSync(
  join(currentDir, '../src/config/package_info.ts'),
  `export function getPackageInfo() {
  return { version: '${version}', name: '${name}' };
}
`,
);
