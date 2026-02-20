import type { LogFn } from '@aztec/foundation/log';

import type { Command } from 'commander';

import { profileGates } from './profile_gates.js';

export function injectProfileCommand(program: Command, log: LogFn): Command {
  const profile = program.command('profile').description('Profile compiled Aztec artifacts.');

  profile
    .command('gates')
    .argument('[target-dir]', 'Path to the compiled artifacts directory', './target')
    .description('Display gate counts for all compiled Aztec artifacts in a target directory.')
    .action((targetDir: string) => profileGates(targetDir, log));

  return program;
}
