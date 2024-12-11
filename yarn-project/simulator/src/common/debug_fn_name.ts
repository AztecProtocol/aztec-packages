import { type AztecAddress, type Fr, FunctionSelector } from '@aztec/circuits.js';

import { type WorldStateDB } from '../public/public_db_sources.js';

export async function getPublicFunctionDebugName(
  db: WorldStateDB,
  contractAddress: AztecAddress,
  calldata: Fr[],
): Promise<string> {
  // Public function is dispatched and therefore the target function is passed in the first argument.
  const targetFunction =
    calldata[0] !== undefined
      ? await db.getDebugFunctionName(contractAddress, FunctionSelector.fromField(calldata[0]))
      : `<calldata[0] undefined> (Contract Address: ${contractAddress})`;
  return `${targetFunction}`;
}
