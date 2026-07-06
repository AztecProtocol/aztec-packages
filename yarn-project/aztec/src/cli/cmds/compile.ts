import { findBbBinary } from '@aztec/bb.js';
import type { LogFn } from '@aztec/foundation/log';
import { getPackageVersion } from '@aztec/foundation/version';

import { execFileSync } from 'child_process';
import type { Command } from 'commander';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';

import { readArtifactFiles } from './utils/artifacts.js';
import { needsRecompile } from './utils/needs_recompile.js';
import { run } from './utils/spawn.js';
import { warnIfAztecVersionMismatch } from './utils/warn_if_aztec_version_mismatch.js';

/** Returns paths to contract artifacts in the target directory. */
async function collectContractArtifacts(): Promise<string[]> {
  let files;
  try {
    files = await readArtifactFiles('target');
  } catch (err: any) {
    if (err?.message?.includes('does not exist')) {
      return [];
    }
    throw err;
  }
  return files.filter(f => Array.isArray(f.content.functions)).map(f => f.filePath);
}

/** Stamps the Aztec stack version into the contract artifacts. */
async function stampAztecVersion(artifactPaths: string[]): Promise<void> {
  const version = getPackageVersion();
  for (const path of artifactPaths) {
    const artifact = JSON.parse(await readFile(path, 'utf-8'));
    // eslint-disable-next-line camelcase
    artifact.aztec_version = version;
    await writeFile(path, JSON.stringify(artifact, null, 2) + '\n');
  }
}

/** Returns the set of package names that are contract crates in the current workspace. */
async function getContractPackageNames(): Promise<Set<string>> {
  const contractNames = new Set<string>();

  let rootToml: string;
  try {
    rootToml = await readFile('Nargo.toml', 'utf-8');
  } catch {
    return contractNames;
  }

  const membersMatch = rootToml.match(/members\s*=\s*\[([^\]]*)\]/);
  if (membersMatch) {
    const members = membersMatch[1]
      .split(',')
      .map(m => m.trim().replace(/^"|"$/g, ''))
      .filter(m => m.length > 0);

    for (const member of members) {
      try {
        const memberToml = await readFile(join(member, 'Nargo.toml'), 'utf-8');
        if (/type\s*=\s*"contract"/.test(memberToml)) {
          const nameMatch = memberToml.match(/name\s*=\s*"([^"]+)"/);
          if (nameMatch) {
            contractNames.add(nameMatch[1]);
          }
        }
      } catch {
        // Member directory might not exist or have no Nargo.toml; skip.
      }
    }
  } else {
    // Single-crate project (no workspace): check if the root Nargo.toml itself is a contract.
    if (/type\s*=\s*"contract"/.test(rootToml)) {
      const nameMatch = rootToml.match(/name\s*=\s*"([^"]+)"/);
      if (nameMatch) {
        contractNames.add(nameMatch[1]);
      }
    }
  }

  return contractNames;
}

/** Checks that no tests exist in contract crates and fails with a helpful message if they do. */
async function checkNoTestsInContracts(nargo: string, log: LogFn): Promise<void> {
  const contractPackages = await getContractPackageNames();
  if (contractPackages.size === 0) {
    return;
  }

  let output: string;
  try {
    // We list tests for all the crates in the workspace
    output = execFileSync(nargo, ['test', '--list-tests', '--silence-warnings'], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'inherit'],
    });
  } catch {
    // If listing tests fails (e.g. test crate has compile errors), skip the check.
    return;
  }

  // The output of the `nargo test --list-tests` command is as follows:
  // ```
  // crate_name_1 test_name_1
  // crate_name_2 test_name_2
  // ...
  // crate_name_n test_name_n
  // ```
  //
  // We parse the individual lines and then we check if any contract crate appeared in the parsed output.
  const lines = output
    .trim()
    .split('\n')
    .filter(line => line.length > 0);
  const testsInContracts: { packageName: string; testName: string }[] = [];

  for (const line of lines) {
    const spaceIndex = line.indexOf(' ');
    if (spaceIndex === -1) {
      continue;
    }
    const packageName = line.substring(0, spaceIndex);
    const testName = line.substring(spaceIndex + 1);
    if (contractPackages.has(packageName)) {
      testsInContracts.push({ packageName, testName });
    }
  }

  if (testsInContracts.length > 0) {
    const details = testsInContracts.map(t => `  ${t.packageName}::${t.testName}`).join('\n');
    log(
      `WARNING: Found tests in contract crate(s):\n${details}\n\n` +
        `Tests should be in a dedicated test crate, not in the contract crate.\n` +
        `Learn more: https://docs.aztec.network/errors/1`,
    );
  }
}

/** Compiles Aztec Noir contracts and postprocesses artifacts. */
async function compileAztecContract(nargoArgs: string[], log: LogFn): Promise<void> {
  await warnIfAztecVersionMismatch(log);

  if (!(await needsRecompile())) {
    log('No source changes detected, skipping compilation.');
    return;
  }

  const nargo = process.env.NARGO ?? 'nargo';
  const bb = process.env.BB ?? findBbBinary() ?? 'bb';

  await run(nargo, ['compile', ...nargoArgs]);

  // Ensure contract crates contain no tests (tests belong in the test crate).
  await checkNoTestsInContracts(nargo, log);

  const artifacts = await collectContractArtifacts();

  if (artifacts.length > 0) {
    log('Postprocessing contracts...');
    const bbArgs = artifacts.flatMap(a => ['-i', a]);
    await run(bb, ['aztec_process', ...bbArgs]);

    await stampAztecVersion(artifacts);
  }

  log('Compilation complete!');
}

export function injectCompileCommand(program: Command, log: LogFn): Command {
  program
    .command('compile')
    .argument('[nargo-args...]')
    .passThroughOptions()
    .allowUnknownOption()
    .description(
      'Compile Aztec Noir contracts using nargo and postprocess them to generate transpiled artifacts and verification keys. All options are forwarded to nargo compile.',
    )
    .addHelpText('after', () => {
      // Show nargo's own compile options so users see all available flags in one place.
      const nargo = process.env.NARGO ?? 'nargo';
      try {
        const output = execFileSync(nargo, ['compile', '--help'], { encoding: 'utf-8' });
        return `\nUnderlying nargo compile options:\n\n${output}`;
      } catch {
        return '\n(Run "nargo compile --help" to see available nargo options)';
      }
    })
    .action((nargoArgs: string[]) => compileAztecContract(nargoArgs, log));

  return program;
}
