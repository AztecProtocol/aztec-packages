import type { Fr } from '@aztec/foundation/fields';
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
  const selector = FunctionSelector.fromField(calldata[0]);
  return (await db.getDebugFunctionName(contractAddress, selector)) ?? selector.toString();
}
