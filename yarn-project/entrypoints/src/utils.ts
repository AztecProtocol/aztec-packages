import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import { type Capsule, HashedValues } from '@aztec/stdlib/tx';

import { type EncodedExecutionPayload, ExecutionPayload } from './payload.js';

/**
 * Merges an array ExecutionPayloads combining their calls, authWitnesses and capsules
 */
export function mergeExecutionPayloads(requests: ExecutionPayload[]): ExecutionPayload {
  const calls = requests.map(r => r.calls).flat();
  const combinedAuthWitnesses = requests.map(r => r.authWitnesses ?? []).flat();
  const combinedCapsules = requests.map(r => r.capsules ?? []).flat();
  const combinedExtraHashedValues = requests.map(r => r.extraHashedValues ?? []).flat();
  return new ExecutionPayload(calls, combinedAuthWitnesses, combinedCapsules, combinedExtraHashedValues);
}

/**
 * Merges an array of mixed ExecutionPayloads and EncodedExecutionPayloads and adds a nonce and cancellable flags,
 * in order to create a single EncodedExecutionPayload.
 */
export async function mergeAndEncodeExecutionPayloads(
  requests: (ExecutionPayload | EncodedExecutionPayload)[],
  {
    extraHashedArgs,
    extraAuthWitnesses,
    extraCapsules,
  }: {
    /** Extra hashed args to be added to the resulting payload (e.g: app_payload and fee_payload args in entrypoint calls) */
    extraHashedArgs?: HashedValues[];
    /** Extra authwitnesses to be added to the resulting payload */
    extraAuthWitnesses?: AuthWitness[];
    /** Extra capsules to be added to the resulting payload */
    extraCapsules?: Capsule[];
  } = { extraAuthWitnesses: [], extraCapsules: [], extraHashedArgs: [] },
): Promise<EncodedExecutionPayload> {
  const isEncoded = (value: ExecutionPayload | EncodedExecutionPayload): value is EncodedExecutionPayload =>
    'encodedFunctionCalls' in value;
  const encoded = (
    await Promise.all(
      requests.map(r => {
        if (!isEncoded(r)) {
          return new ExecutionPayload(r.calls, r.authWitnesses, r.capsules).encode();
        } else {
          return r;
        }
      }),
    )
  ).flat();
  const encodedFunctionCalls = encoded.map(r => r.encodedFunctionCalls).flat();
  const combinedAuthWitnesses = encoded
    .map(r => r.authWitnesses ?? [])
    .flat()
    .concat(extraAuthWitnesses ?? []);
  const hashedArguments = encoded
    .map(r => r.hashedArguments ?? [])
    .flat()
    .concat(extraHashedArgs ?? []);
  const combinedCapsules = encoded
    .map(r => r.capsules ?? [])
    .flat()
    .concat(extraCapsules ?? []);
  return {
    encodedFunctionCalls,
    authWitnesses: combinedAuthWitnesses,
    hashedArguments,
    capsules: combinedCapsules,
    /* eslint-disable camelcase */
    function_calls: encodedFunctionCalls,
    /* eslint-enable camelcase */
  };
}
