import { FunctionCall, PackedArguments, emptyFunctionCall } from '@aztec/circuit-types';
import { AztecAddress, FeeVariables, Fr, FunctionData, GeneratorIndex } from '@aztec/circuits.js';
import { padArrayEnd } from '@aztec/foundation/collection';
import { pedersenHash } from '@aztec/foundation/crypto';

const FEE_MAX_CALLS = 1;

/** Encoded function call for account contract entrypoint */
type FeeFunctionCall = {
  // eslint-disable-next-line camelcase
  /** Arguments hash for the call */
  args_hash: Fr;
  // eslint-disable-next-line camelcase
  /** Selector of the function to call */
  function_selector: Fr;
  // eslint-disable-next-line camelcase
  /** Address of the contract to call */
  target_address: Fr;
  // eslint-disable-next-line camelcase
  /** Whether the function is public or private */
  is_public: boolean;
};

/** Encoded payload for the account contract entrypoint */
export type FeePayload = {
  // eslint-disable-next-line camelcase
  /** Encoded function calls to execute */
  function_calls: FeeFunctionCall[];
  /** A nonce for replay protection */
  nonce: Fr;
};

/**
 * Prepares the fee payload.
 * @param sender - The sender's address
 * @param fee - The fee variables
 */
export function buildFeePayload(sender: AztecAddress, fee: FeeVariables) {
  const nonce = Fr.random();
  const packedArguments: PackedArguments[] = [];
  const calls: FunctionCall[] = [];

  if (!fee.isEmpty()) {
    calls.push({
      to: fee.feeAssetAddress,
      functionData: new FunctionData(fee.feePreparationSelector, false, false, false),
      args: [sender, fee.feePreparationAddress, fee.feeLimit, Fr.ZERO],
    });
  }

  const paddedCalls: FunctionCall[] = padArrayEnd(calls, emptyFunctionCall(), FEE_MAX_CALLS);
  for (const call of paddedCalls) {
    packedArguments.push(PackedArguments.fromArgs(call.args));
  }

  const formattedCalls: FeeFunctionCall[] = paddedCalls.map((call, index) => ({
    /* eslint-disable camelcase */
    args_hash: packedArguments[index].hash,
    function_selector: call.functionData.selector.toField(),
    target_address: call.to.toField(),
    is_public: !call.functionData.isPrivate,
    /* eslint-enable camelcase */
  }));

  return {
    payload: {
      // eslint-disable-next-line camelcase
      function_calls: formattedCalls,
      nonce,
    },
    packedArguments,
  };
}

/** Hashes an entrypoint payload to a 32-byte buffer (useful for signing) */
export function hashFeePayload(payload: FeePayload) {
  return pedersenHash(
    flattenPayload(payload).map(fr => fr.toBuffer()),
    GeneratorIndex.FEE_VARIABLES,
  );
}

/** Flattens an entrypoint payload */
function flattenPayload(payload: FeePayload) {
  return [
    ...payload.function_calls.flatMap(call => [
      call.args_hash,
      call.function_selector,
      call.target_address,
      new Fr(call.is_public),
    ]),
    payload.nonce,
  ];
}
