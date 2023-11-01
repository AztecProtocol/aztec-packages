import { LogFn } from '@aztec/foundation/log';

import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join, resolve } from 'path';
import { SemVer, parse } from 'semver';

import { atomicUpdateFile } from '../utils.js';

/**
 * Looks up a package.json file and returns its contents
 * @param projectPath - Path to Nodejs project
 * @returns The parsed package.json
 */
export async function readPackageJson(projectPath: string): Promise<{
  /** dependencies */
  dependencies?: Record<string, string>;
}> {
  const configFilepath = resolve(join(projectPath, 'package.json'));
  const pkg = JSON.parse(await readFile(configFilepath, 'utf-8'));

  return pkg;
}

/**
 * Queries the npm registry for the latest version of a package
 * @param packageName - The package to query
 * @param distTag - The distribution tag
 * @returns The latest version of the package on that distribution tag
 */
export async function getNewestVersion(packageName: string, distTag = 'latest'): Promise<SemVer> {
  const url = new URL(packageName, 'https://registry.npmjs.org/');
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}`);
  }

  const body = await response.json();
  const latestVersion = parse(body['dist-tags'][distTag]);
  if (!latestVersion) {
    throw new Error(`Failed to get latest version from registry`);
  }

  return latestVersion;
}

/**
 * Updates a project's \@aztec/* dependencies to the specific version
 * @param projectPath - Path to Nodejs project
 * @param aztecVersion - The version to update to
 * @returns True if the project was updated
 */
export async function updateAztecDeps(projectPath: string, aztecVersion: SemVer, log: LogFn): Promise<boolean> {
  const pkg = await readPackageJson(projectPath);
  if (!pkg.dependencies) {
    return false;
  }

  log(`\nUpdating @aztec packages to ${aztecVersion} in ${projectPath}`);
  const version = '^' + aztecVersion.version;
  let dirty = false;
  for (const name of Object.keys(pkg.dependencies)) {
    if (!name.startsWith('@aztec/')) {
      continue;
    }

    // different release schedule
    if (name === '@aztec/aztec-ui') {
      continue;
    }

    if (pkg.dependencies[name] !== version) {
      dirty = true;
      pkg.dependencies[name] = version;
    }
  }

  if (dirty) {
    const contents = JSON.stringify(pkg, null, 2) + '\n';
    await atomicUpdateFile(resolve(join(projectPath, 'package.json')), contents);
    log(`${join(projectPath, 'package.json')} updated`);
    return true;
  } else {
    log('No updates required');
    return false;
  }
}

/**
 * Updates a project's yarn.lock or package-lock.json
 * @param projectPath - Path to Nodejs project
 */
export function updateLockfile(projectPath: string): void {
  const isYarn = existsSync(resolve(join(projectPath, 'yarn.lock')));

  if (isYarn) {
    spawnSync('yarn', {
      cwd: projectPath,
      stdio: 'inherit',
    });
  } else {
    spawnSync('npm', ['install'], {
      cwd: projectPath,
      stdio: 'inherit',
    });
  }
}
