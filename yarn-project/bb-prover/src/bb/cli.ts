import { type LogFn } from '@aztec/foundation/log';
import { ClientCircuitArtifacts } from '@aztec/noir-protocol-circuits-types/client/bundle';
import { ServerCircuitArtifacts } from '@aztec/noir-protocol-circuits-types/server';
import { type ProtocolArtifact } from '@aztec/noir-protocol-circuits-types/types';
import { type NoirCompiledCircuit } from '@aztec/types/noir';

import { Command } from 'commander';

export const ProtocolCircuitArtifacts: Record<ProtocolArtifact, NoirCompiledCircuit> = {
  ...ClientCircuitArtifacts,
  ...ServerCircuitArtifacts,
};

/**
 * Returns commander program that defines the CLI.
 * @param log - Console logger.
 * @returns The CLI.
 */
export function getProgram(log: LogFn): Command {
  const program = new Command('bb-cli');

  program.description('CLI for interacting with Barretenberg.');

  program
    .command('protocol-circuits')
    .description('Lists the available protocol circuit artifacts')
    .action(() => {
      log(Object.keys(ProtocolCircuitArtifacts).reduce((prev: string, x: string) => prev.concat(`\n${x}`)));
    });

  return program;
}
