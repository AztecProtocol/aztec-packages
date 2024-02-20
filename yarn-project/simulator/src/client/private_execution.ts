import { FunctionData, PrivateCallStackItem, PrivateCircuitPublicInputs } from '@aztec/circuits.js';
import { FunctionArtifactWithDebugMetadata, decodeReturnValues } from '@aztec/foundation/abi';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { Fr } from '@aztec/foundation/fields';
import { createDebugLogger } from '@aztec/foundation/log';
import { to2Fields } from '@aztec/foundation/serialize';

import { extractReturnWitness } from '../acvm/deserialize.js';
import { Oracle, acvm, extractCallStack } from '../acvm/index.js';
import { ExecutionError } from '../common/errors.js';
import { ClientExecutionContext } from './client_execution_context.js';
import { ExecutionResult } from './execution_result.js';
import { AcirSimulator } from './simulator.js';

/**
 * Execute a private function and return the execution result.
 */
export async function executePrivateFunction(
  context: ClientExecutionContext,
  artifact: FunctionArtifactWithDebugMetadata,
  contractAddress: AztecAddress,
  functionData: FunctionData,
  log = createDebugLogger('aztec:simulator:secret_execution'),
): Promise<ExecutionResult> {
  const functionSelector = functionData.selector;
  log(`Executing external function ${contractAddress}:${functionSelector}`);
  const acir = Buffer.from(artifact.bytecode, 'base64');
  const initialWitness = context.getInitialWitness(artifact);
  const acvmCallback = new Oracle(context);
  const { partialWitness } = await acvm(await AcirSimulator.getSolver(), acir, initialWitness, acvmCallback).catch(
    (err: Error) => {
      throw new ExecutionError(
        err.message,
        {
          contractAddress,
          functionSelector,
        },
        extractCallStack(err, artifact.debug),
        { cause: err },
      );
    },
  );

  const returnWitness = extractReturnWitness(acir, partialWitness);
  const publicInputs = PrivateCircuitPublicInputs.fromFields(returnWitness);

  const encryptedLogs = context.getEncryptedLogs();
  const unencryptedLogs = context.getUnencryptedLogs();
  // TODO(https://github.com/AztecProtocol/aztec-packages/issues/1165) --> set this in Noir
  publicInputs.encryptedLogsHash = to2Fields(encryptedLogs.hash());
  publicInputs.encryptedLogPreimagesLength = new Fr(encryptedLogs.getSerializedLength());
  publicInputs.unencryptedLogsHash = to2Fields(unencryptedLogs.hash());
  publicInputs.unencryptedLogPreimagesLength = new Fr(unencryptedLogs.getSerializedLength());

  const callStackItem = new PrivateCallStackItem(contractAddress, functionData, publicInputs);
  const returnValues = decodeReturnValues(artifact, publicInputs.returnValues);
  const readRequestPartialWitnesses = context.getReadRequestPartialWitnesses(publicInputs.readRequests);
  const newNotes = context.getNewNotes();
  const nestedExecutions = context.getNestedExecutions();
  const enqueuedPublicFunctionCalls = context.getEnqueuedPublicFunctionCalls();

  log(`Returning from call to ${contractAddress.toString()}:${functionSelector}`);

  return {
    acir,
    partialWitness,
    callStackItem,
    returnValues,
    readRequestPartialWitnesses,
    newNotes,
    vk: Buffer.from(artifact.verificationKey!, 'hex'),
    nestedExecutions,
    enqueuedPublicFunctionCalls,
    encryptedLogs,
    unencryptedLogs,
  };
}
