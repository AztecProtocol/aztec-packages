import { compactArray } from '@aztec/foundation/collection';

import type { ContractFunctionExecutionError } from 'viem';

export function tryGetCustomErrorNameContractFunction(err: ContractFunctionExecutionError) {
  return compactArray([err.shortMessage, ...(err.metaMessages ?? []).slice(0, 2).map(s => s.trim())]).join(' ');
}

/*
 * Returns cost of calldata usage in Ethereum.
 * @param data - Calldata.
 * @returns 4 for each zero byte, 16 for each nonzero.
 */
export function getCalldataGasUsage(data: Uint8Array) {
  return data.filter(byte => byte === 0).length * 4 + data.filter(byte => byte !== 0).length * 16;
}
