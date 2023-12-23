import { LogFn } from '@aztec/foundation/log';

import { parse, stringify } from '@iarna/toml';
import { cpSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

/**
 *
 */
export function unbox(boxName: string, directory: string | undefined, cliVersion: string, _: LogFn) {
  if (cliVersion === '0.1.0') {
    throw new Error('Unbox not supported for pre-release versions. You can override version number with CLI_VERSION.');
  }
  const destPath = directory ? directory : boxName;
  const sourcePath = resolve(dirname(fileURLToPath(import.meta.url)) + '/../../../../boxes/' + boxName);
  if (!existsSync(sourcePath)) {
    throw new Error(`Box ${boxName} not found at ${sourcePath}`);
  }
  cpSync(sourcePath, destPath, { recursive: true });
  updatePackageJson(`${destPath}/package.json`, cliVersion);
  updateNargoToml(`${destPath}/src/contracts/Nargo.toml`, cliVersion);
}

/**
 * TODO: Should this be better done with release-please?
 */
function updatePackageJson(path: string, cliVersion: string) {
  const data = readFileSync(path, 'utf-8');
  const packageJson = JSON.parse(data);

  // Update dependencies
  ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'].forEach(section => {
    if (packageJson[section]) {
      Object.keys(packageJson[section]).forEach(dependency => {
        if (dependency.startsWith('@aztec/')) {
          packageJson[section][dependency] = `^${cliVersion}`;
        }
      });
    }
  });

  // Write the updated package.json back to the file
  writeFileSync(path, JSON.stringify(packageJson, null, 2), 'utf-8');
}

/**
 *
 */
function updateNargoToml(path: string, cliVersion: string) {
  const data = readFileSync(path, 'utf-8');
  const content: any = parse(data);
  const tag = `aztec-packages-v${cliVersion}`;

  Object.keys(content.dependencies).forEach(dep => {
    const dependency = content.dependencies[dep];

    if (dependency.path && dependency.path.startsWith('../../../../yarn-project/')) {
      const directory = dependency.path.replace('../../../../', '');
      content.dependencies[dep] = {
        git: 'https://github.com/AztecProtocol/aztec-packages/',
        tag,
        directory: directory,
      };
    }
  });

  const updatedToml = stringify(content);

  writeFileSync(path, updatedToml, 'utf-8');
}
