import { FunctionCall, PackedArguments } from '@aztec/circuit-types';
import { AztecAddress, Fr, GeneratorIndex } from '@aztec/circuits.js';
import { pedersenHash } from '@aztec/foundation/crypto';

// docs:start:authwit_computeAuthWitMessageHash
/**
 * Compute an authentication witness message hash from a caller and a request
 * H(target: AztecAddress, H(caller: AztecAddress, selector: Field, args_hash: Field))
 * @param caller - The caller approved to make the call
 * @param request - The request to be made (function call)
 * @returns The message hash for the witness
 */
export const computeAuthWitMessageHash = (caller: AztecAddress, request: FunctionCall) => {
  return computeOuterAuthWitHash(
    request.to.toField(),
    computeInnerAuthWitHash([
      caller.toField(),
      request.functionData.selector.toField(),
      PackedArguments.fromArgs(request.args).hash,
    ]),
  );
};
// docs:end:authwit_computeAuthWitMessageHash

/**
 * Compute the inner hash for an authentication witness.
 * This is the value provided to the contract function as input.
 * @param args - The arguments to hash
 * @returns The inner hash for the witness
 */
export const computeInnerAuthWitHash = (args: Fr[]) => {
  return pedersenHash(
    args.map(fr => fr.toBuffer()),
    GeneratorIndex.AUTHWIT_INNER,
  );
};

/**
 * Compute the outer hash for an authentication witness.
 * This is the value to sign over.
 * @param to - The target of the witness (the consumer)
 * @param innerHash - The inner hash for the witness
 * @returns The outer hash for the witness
 */
export const computeOuterAuthWitHash = (to: AztecAddress, innerHash: Fr) => {
  return pedersenHash(
    [to.toField(), innerHash].map(fr => fr.toBuffer()),
    GeneratorIndex.AUTHWIT_OUTER,
  );
};
