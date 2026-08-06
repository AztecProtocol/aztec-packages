#!/usr/bin/env node
// Runs a forge deploy script (e.g. DeployRollupForUpgrade) against the foundry bundle
// shipped in the @aztec/l1-artifacts npm package, forwarding all arguments to
// forge_broadcast.js. Requires yarn-project to be built.
//
// prepareL1ContractsForDeployment copies the bundle to a temp directory (forge writes
// broadcast/ and cache there) and removes it when the process that created it exits,
// so the copy and the forge run must share this single process.
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { prepareL1ContractsForDeployment, getL1ContractsPath } = await import(
  pathToFileURL(join(repoRoot, 'yarn-project', 'ethereum', 'dest', 'deploy_aztec_l1_contracts.js'))
);

const projectDir = prepareL1ContractsForDeployment();
// The bundle's scripts/ directory is not part of the temp copy; forge_broadcast.js is
// self-contained and only cares about the cwd it runs forge from.
const broadcastScript = join(getL1ContractsPath(), 'scripts', 'forge_broadcast.js');

const child = spawn(process.execPath, [broadcastScript, ...process.argv.slice(2)], {
  cwd: projectDir,
  stdio: 'inherit',
});
child.on('error', err => {
  console.error(`Failed to run ${broadcastScript}: ${err.message}`);
  process.exit(1);
});
child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`forge_broadcast.js terminated by signal ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
