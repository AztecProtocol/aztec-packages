import { LogFn } from '@aztec/foundation/log';
import { NoirPackageConfig, parseNoirPackageConfig } from '@aztec/foundation/noir';

import TOML from '@ltd/j-toml';
import { readFile } from 'fs/promises';
import { EOL } from 'os';
import { join, resolve } from 'path';

import { atomicUpdateFile } from '../utils.js';

/**
 * Updates Aztec.nr dependencies
 * @param contractPath - Path to the contract to be updated
 * @param tag - The tag to update to
 * @param log - Logging function
 */
export async function updateAztecNr(contractPath: string, tag: string, log: LogFn) {
  const configFilepath = resolve(join(contractPath, 'Nargo.toml'));
  const packageConfig = parseNoirPackageConfig(TOML.parse(await readFile(configFilepath, 'utf-8')));
  let dirty = false;

  log(`\nUpdating Aztec.nr libraries to ${tag} in ${contractPath}`);
  for (const dep of Object.values(packageConfig.dependencies)) {
    if (!('git' in dep)) {
      continue;
    }

    // remove trailing slash
    const gitUrl = dep.git.toLowerCase().replace(/\/$/, '');
    if (gitUrl !== 'https://github.com/aztecprotocol/aztec-packages') {
      continue;
    }

    if (dep.tag !== tag) {
      dirty = true;
      dep.tag = tag;
    }
  }

  if (dirty) {
    const contents = prettyPrintTOML(packageConfig);
    await atomicUpdateFile(configFilepath, contents);
    log(`${join(contractPath, 'Nargo.toml')} updated`);
  } else {
    log('No updates required');
  }
}

/**
 * Pretty prints a NoirPackageConfig to a string
 * @param packageConfig - Nargo.toml contents
 * @returns The Nargo.toml contents as a string
 */
function prettyPrintTOML(packageConfig: NoirPackageConfig): string {
  // hint to TOML.stringify how we want the file to look like
  return TOML.stringify(
    {
      package: TOML.Section(packageConfig.package),
      dependencies: TOML.Section(
        Object.fromEntries(Object.entries(packageConfig.dependencies).map(([name, dep]) => [name, TOML.inline(dep)])),
      ),
    },
    {
      indent: 2,
      newline: EOL as any,
      newlineAround: 'section',
    },
  );
}
