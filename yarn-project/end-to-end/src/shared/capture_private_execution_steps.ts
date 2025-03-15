/**
 * This module exposes the ability to capture the private exection steps that go into our "Client IVC" prover.
 * These are used for debugging and benchmarking barretenberg (the prover component).
 */
import type { ContractFunctionInteraction } from '@aztec/aztec.js/contracts';
import { createLogger } from '@aztec/foundation/log';
import { serializeWitness } from '@aztec/noir-noirc_abi';
import type { PrivateExecutionStep } from '@aztec/stdlib/kernel';

import { encode } from '@msgpack/msgpack';
import { promises as fs } from 'fs';
import path from 'path';

const logger = createLogger('e2e:capture-private-execution-steps');

// TODO(#7371): This is duplicated.
// Longer term we won't use this hacked together msgpack format
// Leaving duplicated as this eventually bb will provide a serialization
// helper for passing to a generic msgpack RPC endpoint.
async function _createClientIvcProofFiles(directory: string, executionSteps: PrivateExecutionStep[]) {
  const acirPath = path.join(directory, 'acir.msgpack');
  const witnessPath = path.join(directory, 'witnesses.msgpack');
  await fs.writeFile(acirPath, encode(executionSteps.map(map => map.bytecode)));
  await fs.writeFile(witnessPath, encode(executionSteps.map(map => serializeWitness(map.witness))));
  return {
    acirPath,
    witnessPath,
  };
}

export async function capturePrivateExecutionStepsIfEnvSet(label: string, interaction: ContractFunctionInteraction) {
  // Not included in env_var.ts as internal to e2e tests.
  const ivcFolder = process.env.CAPTURE_IVC_FOLDER;
  if (ivcFolder) {
    logger.info(`Capturing client ivc execution steps for ${label}`);
    const result = await interaction.profile({ profileMode: 'execution-steps' });
    const resultsDirectory = path.join(ivcFolder, label);
    logger.info(`Writing private execution steps to ${resultsDirectory}`);
    await fs.mkdir(resultsDirectory, { recursive: true });
    await _createClientIvcProofFiles(resultsDirectory, result.executionSteps);
    logger.info(`Wrote private execution steps to ${resultsDirectory}`);
  }
}
