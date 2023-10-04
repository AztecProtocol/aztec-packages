import { AztecAddress, CircuitsWasm, GeneratorIndex } from '@aztec/circuits.js';
import { pedersenPlookupCompressWithHashIndex } from '@aztec/circuits.js/barretenberg';
import { FunctionCall, PackedArguments } from '@aztec/types';

/**
 * Compute an authentication witness message hash from a caller and a request
 * H(caller, target, selector, args_hash)
 * @param caller - The caller approved to make the call
 * @param request - The request to be made (function call)
 * @returns The message hash for the witness
 */
export const computeAuthWitHash = async (caller: AztecAddress, request: FunctionCall) => {
  const wasm = await CircuitsWasm.get();
  return pedersenPlookupCompressWithHashIndex(
    wasm,
    [
      caller.toField(),
      request.to.toField(),
      request.functionData.selector.toField(),
      (await PackedArguments.fromArgs(request.args, wasm)).hash,
    ].map(fr => fr.toBuffer()),
    GeneratorIndex.SIGNATURE_PAYLOAD,
  );
};
