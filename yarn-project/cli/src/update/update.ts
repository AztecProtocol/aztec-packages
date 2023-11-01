/* eslint-disable jsdoc/require-jsdoc */
import { DebugLogger, LogFn } from '@aztec/foundation/log';

import { resolve } from 'path';
import { SemVer, coerce, gt, lt, parse } from 'semver';

import { createCompatibleClient } from '../client.js';
import { GITHUB_TAG_PREFIX } from '../github.js';
import { updateAztecNr } from './noir.js';
import { getNewestVersion, readPackageJson, updateAztecDeps, updateLockfile } from './npm.js';

const SANDBOX_PACKAGE = '@aztec/aztec-sandbox';

export async function update(
  projectPath: string,
  contracts: string[],
  pxeUrl: string,
  log: LogFn,
  debugLog: DebugLogger,
): Promise<void> {
  const latestSandboxVersion = await getNewestVersion(SANDBOX_PACKAGE, 'latest');
  let currentSandboxVersion = await getNpmSandboxVersion(projectPath);

  if (!currentSandboxVersion) {
    currentSandboxVersion = await getRemoteSandboxVersion(pxeUrl, debugLog);

    if (currentSandboxVersion && lt(currentSandboxVersion, latestSandboxVersion)) {
      log(`
Sandbox is older than version ${latestSandboxVersion}. If running in docker update it with the following command then restart the container:
docker pull aztecprotocol/aztec-sandbox:latest`);
      return;
    }
  }

  if (!currentSandboxVersion) {
    throw new Error('Sandbox version could not be detected');
  }

  // sanity check
  if (gt(currentSandboxVersion, latestSandboxVersion)) {
    throw new Error('Local sandbox version is newer than latest version.');
  }

  const changed = await updateAztecDeps(projectPath, latestSandboxVersion, log);
  if (changed) {
    updateLockfile(projectPath);
  }

  for (const contract of contracts) {
    await updateAztecNr(resolve(projectPath, contract), `${GITHUB_TAG_PREFIX}-v${latestSandboxVersion}`, log);
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
