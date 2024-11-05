import { type AztecAddress, Fr, FunctionSelector, PUBLIC_DISPATCH_SELECTOR } from '@aztec/circuits.js';

import { type WorldStateDB } from '../public/public_db_sources.js';

export async function getPublicFunctionDebugName(
  db: WorldStateDB,
  contractAddress: AztecAddress,
  fn: FunctionSelector,
  calldata: Fr[],
): Promise<string> {
  if (fn.equals(FunctionSelector.fromField(new Fr(PUBLIC_DISPATCH_SELECTOR)))) {
    // If the function is a dispatch, we need to look up the target function which
    // is expected to be the first argument.
    const targetFunction =
      calldata[0] !== undefined
        ? await db.getDebugFunctionName(contractAddress, FunctionSelector.fromField(calldata[0]))
        : `<calldata[0] undefined>`;
    return `${targetFunction} (via dispatch)`;
  } else {
    return (await db.getDebugFunctionName(contractAddress, fn)) ?? `${contractAddress}:${fn}`;
  }
}
