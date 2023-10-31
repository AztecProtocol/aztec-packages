import { LogFn } from '@aztec/foundation/log';
import { NoirPackageConfig, parseNoirPackageConfig } from '@aztec/foundation/noir';

import TOML from '@ltd/j-toml';
import { CommanderError } from 'commander';
import { readFile, rename, writeFile } from 'fs/promises';
import { EOL } from 'os';
import { join, resolve } from 'path';

import { GITHUB_TAG_PREFIX, getRecentAztecReleases } from './github.js';

/**
 * Checks if a version exists on Github.
 * @param version - A semver string
 * @returns true if the version exists
 */
export async function aztecNrVersionToTagName(version: string): Promise<string> {
  const releases = await getRecentAztecReleases();
  const tagName = `${GITHUB_TAG_PREFIX}-v${version}`;
  const exists = releases.find(release => release.tagName === tagName) !== undefined;
  if (exists) {
    return tagName;
  }

  throw new CommanderError(1, '', `Unknown Aztec.nr version ${version}`);
}

/**
 * Gets the latest released version of Aztec.nr.
 */
export async function getLatestAztecNrTag(): Promise<string> {
  const releases = await getRecentAztecReleases();
  return releases[0].tagName;
}

/**
 * Opens an Aztec.nr contract and updates Aztec.nr to the requested version.
 * @param contractPath - Path to an Aztec.nr contract
 * @param tag - The version of Aztec.nr to update to
 * @param log - Logging function
 */
export async function updateAztecNr(contractPath: string, tag: string, log: LogFn) {
  try {
    const configFilepath = resolve(join(contractPath, 'Nargo.toml'));
    const packageConfig = parseNoirPackageConfig(TOML.parse(await readFile(configFilepath, 'utf-8')));
    let dirty = false;
    log(`Updating ${packageConfig.package.name} to Aztec.nr@${tag}`);
    for (const [name, dep] of Object.entries(packageConfig.dependencies)) {
      if (!('git' in dep)) {
        continue;
      }

      // check both trailing an non-trailing slash as technically they are different URLs
      if (
        dep.git.toLowerCase() !== 'https://github.com/AztecProtocol/aztec-packages'.toLowerCase() &&
        dep.git.toLowerCase() !== 'https://github.com/AztecProtocol/aztec-packages/'.toLowerCase()
      ) {
        continue;
      }

      if (dep.tag !== tag) {
        log(`Updating ${name} to ${tag}`);
        dep.tag = tag;
        dirty = true;
      }
    }

    if (dirty) {
      await writeNoirPackageConfigAsToml(configFilepath, packageConfig);
    } else {
      log('No updates required');
    }
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
      log('No Nargo.toml found. Skipping update.');
      return;
    }
    throw err;
  }
}

/**
 * Writes a contract's configuration as TOML at the given path.
 * @param filePath - Where to write the TOML
 * @param packageConfig - The Noir configuration
 */
async function writeNoirPackageConfigAsToml(filePath: string, packageConfig: NoirPackageConfig): Promise<void> {
  // hint to TOML.stringify how we want the file to look like
  const toml = TOML.stringify(
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

  const tmpFilepath = filePath + '.tmp';
  try {
    await writeFile(tmpFilepath, toml, {
      // let's crash if the tmp file already exists
      flag: 'wx',
    });
    await rename(tmpFilepath, filePath);
  } catch (e) {
    if (e instanceof Error && 'code' in e && e.code === 'EEXIST') {
      const commanderError = new CommanderError(
        1,
        e.code,
        `Temporary file already exists: ${tmpFilepath}. Delete this file and try again.`,
      );
      commanderError.nestedError = e.message;
      throw commanderError;
    } else {
      throw e;
    }
  }
}
