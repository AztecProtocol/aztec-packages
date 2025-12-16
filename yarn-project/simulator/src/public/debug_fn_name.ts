import type { Fr } from '@aztec/foundation/curves/bn254';
import { FunctionSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

import type { PublicContractsDBInterface } from './db_interfaces.js';

export async function getPublicFunctionDebugName(
  db: PublicContractsDBInterface,
  contractAddress: AztecAddress,
  calldata: Fr[],
): Promise<string> {
  // Public function is dispatched and therefore the target function is passed in the first argument.
  if (!calldata[0]) {
    return `<calldata[0] undefined> (Contract Address: ${contractAddress})`;
  }
  const fallbackName = `<calldata[0]:${calldata[0].toString()}> (Contract Address: ${contractAddress})`;
  const selector = FunctionSelector.fromFieldOrUndefined(calldata[0]);
  if (!selector) {
    return fallbackName;
  }
  return (await db.getDebugFunctionName(contractAddress, selector)) ?? fallbackName;
}

/**
 * Get the function selector and optional debug name for a public function.
 * Returns the selector and name separately, with name only populated if a debug name is available.
 * @param db - The contracts database
 * @param contractAddress - The contract address
 * @param calldata - The calldata (selector is in calldata[0])
 * @returns An object with functionSelector (always if calldata[0] exists) and functionName (only if debug name found)
 */
export async function getPublicFunctionSelectorAndName(
  db: PublicContractsDBInterface,
  contractAddress: AztecAddress,
  calldata: Fr[],
): Promise<{ functionSelector?: FunctionSelector; functionName?: string }> {
  // Public function is dispatched and therefore the target function is passed in the first argument.
  if (!calldata[0]) {
    return {};
  }
  const selector = FunctionSelector.fromFieldOrUndefined(calldata[0]);
  if (!selector) {
    return {};
  }
  const debugName = await db.getDebugFunctionName(contractAddress, selector);
  return {
    functionSelector: selector,
    functionName: debugName ?? undefined,
  };
}
