import type { LogFn } from '@aztec/foundation/log';

import type { Command } from 'commander';

import { profileFlamegraph } from './profile_flamegraph.js';
import { profileGates } from './profile_gates.js';

export function injectProfileCommand(program: Command, log: LogFn): Command {
  const profile = program.command('profile').description('Profile compiled Aztec artifacts.');

  profile
    .command('gates')
    .argument('[target-dir]', 'Path to the compiled artifacts directory', './target')
    .option('--json', 'Output gate counts as JSON instead of a table', false)
    .description('Display gate counts for all compiled Aztec artifacts in a target directory.')
    .action((targetDir: string, options: { json: boolean }) => profileGates(targetDir, options.json, log));

  profile
    .command('flamegraph')
    .argument('<contract-artifact>', 'Path to the compiled contract artifact JSON')
    .argument('<function>', 'Name of the contract function to profile')
    .description('Generate a gate count flamegraph SVG for a contract function.')
    .action((artifactPath: string, functionName: string) => profileFlamegraph(artifactPath, functionName, log));

  return program;
}
