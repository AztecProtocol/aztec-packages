import { poseidon2HashWithSeparator } from '@aztec/foundation/crypto';
import type { Fr } from '@aztec/foundation/fields';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import type { Capsule, HashedValues } from '@aztec/stdlib/tx';

import { GeneratorIndex } from '../../constants/src/constants.gen.js';
import type { EncodedExecutionPayload, ExecutionRequestInit } from './interfaces.js';
import type { AppEntrypointPayload, FeeEntrypointPayload } from './payload.js';

/**
 * Merges an array of EncodedExecutionPayloads and adds a nonce and cancellable flags,
 * in order to create a single ExecutionRequestInit.
 */
export function mergeEncodedExecutionPayloads(
  requests: EncodedExecutionPayload[],
  {
    nonce,
    cancellable,
    extraHashedArgs,
    extraAuthWitnesses,
    extraCapsules,
  }: {
    nonce?: Fr;
    cancellable?: boolean;
    extraHashedArgs?: HashedValues[];
    extraAuthWitnesses?: AuthWitness[];
    extraCapsules?: Capsule[];
  } = { extraAuthWitnesses: [], extraCapsules: [], extraHashedArgs: [] },
): ExecutionRequestInit {
  const encodedFunctionCalls = requests.map(r => r.encodedFunctionCalls).flat();
  const combinedAuthWitnesses = requests
    .map(r => r.authWitnesses ?? [])
    .flat()
    .concat(extraAuthWitnesses ?? []);
  const hashedArguments = requests
    .map(r => r.hashedArguments ?? [])
    .flat()
    .concat(extraHashedArgs ?? []);
  const combinedCapsules = requests
    .map(r => r.capsules ?? [])
    .flat()
    .concat(extraCapsules ?? []);
  return {
    encodedFunctionCalls,
    authWitnesses: combinedAuthWitnesses,
    hashedArguments,
    capsules: combinedCapsules,
    nonce,
    cancellable,
  };
}

/**
 * Computes a hash of a combined payload.
 * @param appPayload - An app payload.
 * @param feePayload - A fee payload.
 * @returns A hash of a combined payload.
 */
export async function computeCombinedPayloadHash(
  appPayload: AppEntrypointPayload,
  feePayload: FeeEntrypointPayload,
): Promise<Fr> {
  return poseidon2HashWithSeparator(
    [await appPayload.hash(), await feePayload.hash()],
    GeneratorIndex.COMBINED_PAYLOAD,
  );
}
