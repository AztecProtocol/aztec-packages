import { LogFn } from '@aztec/foundation/log';

import { spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';

/**
 * Updates \@aztec/* dependencies in a project to their latest version
 * @param path - Path to Nodejs project
 * @param log - Logging function
 */
export function updateAztecDeps(path: string, version: string, log: LogFn) {
  const configFilepath = resolve(join(path, 'package.json'));
  const pkg = JSON.parse(readFileSync(configFilepath, 'utf-8'));
  const aztecDepsWithNewVersion = Object.keys(pkg.dependencies)
    .filter(
      dep =>
        dep.startsWith('@aztec/') &&
        // this is on a different release cycle
        dep !== '@aztec/aztec-ui',
    )
    .map(dep => `${dep}@${version}`);

  const isYarn = existsSync(resolve(join(path, 'yarn.lock')));

  log(`Updating ${aztecDepsWithNewVersion.join(', ')}`);

  if (isYarn) {
    const yarnVersion = spawnSync('yarn', ['--version'], {
      cwd: path,
      stdio: 'pipe',
    });
    const yarnVersionStr = yarnVersion.stdout.toString().trim();
    const yarnVersionParts = yarnVersionStr.split('.');
    const yarnMajor = parseInt(yarnVersionParts[0]);

    if (yarnMajor === 1) {
      spawnSync('yarn', ['add', ...aztecDepsWithNewVersion], {
        cwd: path,
        stdio: 'inherit',
      });
    } else {
      spawnSync('yarn', ['up', `@aztec/*@${version}`], {
        cwd: path,
        stdio: 'inherit',
      });
    }
  } else {
    spawnSync('npm', ['install', ...aztecDepsWithNewVersion], {
      cwd: path,
      stdio: 'inherit',
    });
  }
}
