import { type Tx } from '@aztec/circuits.js';
import type { FunctionSelector } from '@aztec/circuits.js/abi';
import type { AztecAddress } from '@aztec/circuits.js/aztec-address';
import { computeVarArgsHash } from '@aztec/circuits.js/hash';
import type { Fr } from '@aztec/foundation/fields';

export function patchNonRevertibleFn(
  tx: Tx,
  index: number,
  overrides: { address?: AztecAddress; selector: FunctionSelector; args?: Fr[]; msgSender?: AztecAddress },
): Promise<{ address: AztecAddress; selector: FunctionSelector }> {
  return patchFn('nonRevertibleAccumulatedData', tx, index, overrides);
}

export function patchRevertibleFn(
  tx: Tx,
  index: number,
  overrides: { address?: AztecAddress; selector: FunctionSelector; args?: Fr[]; msgSender?: AztecAddress },
): Promise<{ address: AztecAddress; selector: FunctionSelector }> {
  return patchFn('revertibleAccumulatedData', tx, index, overrides);
}

async function patchFn(
  where: 'revertibleAccumulatedData' | 'nonRevertibleAccumulatedData',
  tx: Tx,
  index: number,
  overrides: { address?: AztecAddress; selector: FunctionSelector; args?: Fr[]; msgSender?: AztecAddress },
): Promise<{ address: AztecAddress; selector: FunctionSelector }> {
  const fn = tx.enqueuedPublicFunctionCalls.at(-1 * index - 1)!;
  fn.callContext.contractAddress = overrides.address ?? fn.callContext.contractAddress;
  fn.callContext.functionSelector = overrides.selector;
  fn.args = overrides.args ?? fn.args;
  fn.callContext.msgSender = overrides.msgSender ?? fn.callContext.msgSender;
  tx.enqueuedPublicFunctionCalls[index] = fn;

  const request = tx.data.forPublic![where].publicCallRequests[index];
  request.contractAddress = fn.callContext.contractAddress;
  request.msgSender = fn.callContext.msgSender;
  request.functionSelector = fn.callContext.functionSelector;
  request.isStaticCall = fn.callContext.isStaticCall;
  request.argsHash = await computeVarArgsHash(fn.args);
  tx.data.forPublic![where].publicCallRequests[index] = request;

  return {
    address: fn.callContext.contractAddress,
    selector: fn.callContext.functionSelector,
  };
}
