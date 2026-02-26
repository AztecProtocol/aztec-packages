import type { LogFn } from '@aztec/foundation/log';

import { execFileSync } from 'child_process';
import type { Command } from 'commander';
import { readFile, writeFile } from 'fs/promises';

import { readArtifactFiles } from './utils/artifacts.js';
import { run } from './utils/spawn.js';

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

/** Strips the `__aztec_nr_internals__` prefix from function names in contract artifacts. */
async function stripInternalPrefixes(artifactPaths: string[]): Promise<void> {
  for (const path of artifactPaths) {
    const artifact = JSON.parse(await readFile(path, 'utf-8'));
    for (const fn of artifact.functions) {
      if (typeof fn.name === 'string') {
        fn.name = fn.name.replace(/^__aztec_nr_internals__/, '');
      }
    }
    await writeFile(path, JSON.stringify(artifact, null, 2) + '\n');
  }
}

/** Compiles Aztec Noir contracts and postprocesses artifacts. */
async function compileAztecContract(nargoArgs: string[], log: LogFn): Promise<void> {
  const nargo = process.env.NARGO ?? 'nargo';
  const bb = process.env.BB ?? 'bb';

  await run(nargo, ['compile', ...nargoArgs]);

  const artifacts = await collectContractArtifacts();

  if (artifacts.length > 0) {
    log('Postprocessing contracts...');
    const bbArgs = artifacts.flatMap(a => ['-i', a]);
    await run(bb, ['aztec_process', ...bbArgs]);

    // TODO: This should be part of bb aztec_process!
    await stripInternalPrefixes(artifacts);
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
