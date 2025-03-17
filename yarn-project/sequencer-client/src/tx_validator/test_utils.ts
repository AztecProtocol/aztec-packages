import type { Fr } from '@aztec/foundation/fields';
import type { FunctionSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { computeCalldataHash } from '@aztec/stdlib/hash';
import { HashedValues, type Tx } from '@aztec/stdlib/tx';

export function patchNonRevertibleFn(
  tx: Tx,
  index: number,
  overrides: { address?: AztecAddress; selector: FunctionSelector; args?: Fr[]; msgSender?: AztecAddress },
): Promise<AztecAddress> {
  return patchFn('nonRevertibleAccumulatedData', tx, index, overrides);
}

export function patchRevertibleFn(
  tx: Tx,
  index: number,
  overrides: { address?: AztecAddress; selector: FunctionSelector; args?: Fr[]; msgSender?: AztecAddress },
): Promise<AztecAddress> {
  return patchFn('revertibleAccumulatedData', tx, index, overrides);
}

async function patchFn(
  where: 'revertibleAccumulatedData' | 'nonRevertibleAccumulatedData',
  tx: Tx,
  index: number,
  overrides: { address?: AztecAddress; selector: FunctionSelector; args?: Fr[]; msgSender?: AztecAddress },
): Promise<AztecAddress> {
  const calldataIndex =
    where === 'nonRevertibleAccumulatedData'
      ? index
      : index + tx.data.forPublic!.nonRevertibleAccumulatedData.publicCallRequests.length;
  const calldata = [overrides.selector.toField(), ...(overrides.args ?? [])];
  const calldataHash = await computeCalldataHash(calldata);
  tx.publicFunctionCalldata[calldataIndex] = new HashedValues(calldata, calldataHash);

  const request = tx.data.forPublic![where].publicCallRequests[index];
  request.contractAddress = overrides.address ?? request.contractAddress;
  request.msgSender = overrides.msgSender ?? request.msgSender;
  request.calldataHash = calldataHash;
  tx.data.forPublic![where].publicCallRequests[index] = request;

  return request.contractAddress;
}
