import { type AbiDecoded, type FunctionArtifact, type FunctionSelector, decodeFromAbi } from '@aztec/foundation/abi';
import { type AztecAddress } from '@aztec/foundation/aztec-address';
import { type Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';

import { witnessMapToFields } from '../acvm/deserialize.js';
import { Oracle, acvm, extractCallStack, toACVMWitness } from '../acvm/index.js';
import { ExecutionError, resolveAssertionMessageFromError } from '../common/errors.js';
import { type ViewDataOracle } from './view_data_oracle.js';

// docs:start:execute_unconstrained_function
/**
 * Execute an unconstrained function and return the decoded values.
 */
export async function executeUnconstrainedFunction(
  oracle: ViewDataOracle,
  artifact: FunctionArtifact,
  contractAddress: AztecAddress,
  functionSelector: FunctionSelector,
  args: Fr[],
  log = createLogger('simulator:unconstrained_execution'),
): Promise<AbiDecoded> {
  log.verbose(`Executing unconstrained function ${contractAddress}:${functionSelector}(${artifact.name})`);

  const acir = artifact.bytecode;
  const initialWitness = toACVMWitness(0, args);
  const acirExecutionResult = await acvm(acir, initialWitness, new Oracle(oracle)).catch((err: Error) => {
    err.message = resolveAssertionMessageFromError(err, artifact);
    throw new ExecutionError(
      err.message,
      {
        contractAddress,
        functionSelector,
      },
      extractCallStack(err, artifact.debug),
      { cause: err },
    );
  });

  const returnWitness = witnessMapToFields(acirExecutionResult.returnWitness);
  return decodeFromAbi(artifact.returnTypes, returnWitness);
}
// docs:end:execute_unconstrained_function
