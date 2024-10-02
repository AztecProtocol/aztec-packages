import { type PublicExecutionResult, type UnencryptedFunctionL2Logs } from '@aztec/circuit-types';
import {
  type ContractStorageUpdateRequest,
  Gas,
  type L2ToL1Message,
  type NoteHash,
  type Nullifier,
  PublicCallStackItemCompressed,
  PublicInnerCallRequest,
  RevertCode,
} from '@aztec/circuits.js';
import { computeVarArgsHash } from '@aztec/circuits.js/hash';

export function collectExecutionResults(result: PublicExecutionResult): PublicExecutionResult[] {
  return [result, ...result.nestedExecutions.map(collectExecutionResults)].flat();
}

/**
 * Checks whether the child execution result is valid for a static call (no state modifications).
 * @param executionResult - The execution result of a public function
 */

export function checkValidStaticCall(
  noteHashes: NoteHash[],
  nullifiers: Nullifier[],
  contractStorageUpdateRequests: ContractStorageUpdateRequest[],
  l2ToL1Messages: L2ToL1Message[],
  unencryptedLogs: UnencryptedFunctionL2Logs,
) {
  if (
    contractStorageUpdateRequests.length > 0 ||
    noteHashes.length > 0 ||
    nullifiers.length > 0 ||
    l2ToL1Messages.length > 0 ||
    unencryptedLogs.logs.length > 0
  ) {
    throw new Error('Static call cannot update the state, emit L2->L1 messages or generate logs');
  }
}

export function resultToPublicCallRequest(result: PublicExecutionResult) {
  const request = result.executionRequest;
  const item = new PublicCallStackItemCompressed(
    request.contractAddress,
    request.callContext,
    computeVarArgsHash(request.args),
    computeVarArgsHash(result.returnValues),
    // TODO(@just-mitch): need better mapping from simulator to revert code.
    result.reverted ? RevertCode.APP_LOGIC_REVERTED : RevertCode.OK,
    Gas.from(result.startGasLeft),
    Gas.from(result.endGasLeft),
  );
  return new PublicInnerCallRequest(item, result.startSideEffectCounter.toNumber());
}
