/* eslint-disable jsdoc/require-jsdoc */
import { DebugLogger, LogFn } from '@aztec/foundation/log';

import { relative, resolve } from 'path';
import { SemVer, coerce, gt, lt, parse } from 'semver';

import { createCompatibleClient } from '../client.js';
import { GITHUB_TAG_PREFIX } from '../github.js';
import { DependencyChanges } from './common.js';
import { updateAztecNr } from './noir.js';
import { getNewestVersion as getLatestVersion, readPackageJson, updateAztecDeps, updateLockfile } from './npm.js';

const SANDBOX_PACKAGE = '@aztec/aztec-sandbox';

export async function update(
  projectPath: string,
  contracts: string[],
  pxeUrl: string,
  sandboxVersion: string,
  log: LogFn,
  debugLog: DebugLogger,
): Promise<void> {
  const targetSandboxVersion =
    sandboxVersion === 'latest' ? await getLatestVersion(SANDBOX_PACKAGE, 'latest') : parse(sandboxVersion);

  if (!targetSandboxVersion) {
    throw new Error(`Invalid aztec version ${sandboxVersion}`);
  }

  let currentSandboxVersion = await getNpmSandboxVersion(projectPath);

  if (!currentSandboxVersion) {
    currentSandboxVersion = await getRemoteSandboxVersion(pxeUrl, debugLog);

    if (currentSandboxVersion && lt(currentSandboxVersion, targetSandboxVersion)) {
      log(`
Sandbox is older than version ${targetSandboxVersion}. If running in docker update it with the following command then restart the container:
docker pull aztecprotocol/aztec-sandbox:latest
Once the container is restarted, run the \`aztec-cli update\` command again`);
      return;
    }
  }

  if (!currentSandboxVersion) {
    throw new Error('Sandbox version could not be detected');
  }

  // sanity check
  if (gt(currentSandboxVersion, targetSandboxVersion)) {
    throw new Error('Local sandbox version is newer than latest version.');
  }

  const npmChanges = await updateAztecDeps(projectPath, targetSandboxVersion, log);
  if (npmChanges.dependencies.length > 0) {
    updateLockfile(projectPath);
  }

  const contractChanges: DependencyChanges[] = [];
  for (const contract of contracts) {
    contractChanges.push(
      await updateAztecNr(resolve(projectPath, contract), `${GITHUB_TAG_PREFIX}-v${targetSandboxVersion.version}`, log),
    );
  }

  printChanges(npmChanges, log);

  contractChanges.forEach(changes => {
    printChanges(changes, log);
  });
}

function printChanges(changes: DependencyChanges, log: LogFn): void {
  log(`\nIn ${relative(process.cwd(), changes.file)}:`);
  if (changes.dependencies.length === 0) {
    log('  No changes');
  } else {
    changes.dependencies.forEach(({ name, from, to }) => {
      log(`  Updated ${name} from ${from} to ${to}`);
    });
  }
}

async function getNpmSandboxVersion(projectPath: string): Promise<SemVer | null> {
  const pkg = await readPackageJson(projectPath);
  // use coerce instead of parse because it eliminates semver operators like ~ and ^
  return coerce(pkg.dependencies?.[SANDBOX_PACKAGE]);
}

async function getRemoteSandboxVersion(pxeUrl: string, debugLog: DebugLogger): Promise<SemVer | null> {
  const client = await createCompatibleClient(pxeUrl, debugLog);
  const nodeInfo = await client.getNodeInfo();

  return parse(nodeInfo.sandboxVersion);
}
