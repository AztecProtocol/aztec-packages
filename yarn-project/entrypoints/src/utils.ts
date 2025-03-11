import { poseidon2HashWithSeparator } from '@aztec/foundation/crypto';
import type { Fr } from '@aztec/foundation/fields';

import { GeneratorIndex } from '../../constants/src/constants.gen.js';
import type { ExecutionRequestInit } from './interfaces.js';
import type { AppEntrypointPayload, FeeEntrypointPayload } from './payload.js';

/**
 * Merges an array of ExecutionRequestInits.
 */
export function mergeExecutionRequestInits(
  requests: Pick<ExecutionRequestInit, 'calls' | 'authWitnesses' | 'hashedArguments' | 'capsules'>[],
  { nonce, cancellable }: Pick<ExecutionRequestInit, 'nonce' | 'cancellable'> = {},
): Omit<ExecutionRequestInit, 'fee'> {
  const calls = requests.map(r => r.calls).flat();
  const authWitnesses = requests.map(r => r.authWitnesses ?? []).flat();
  const hashedArguments = requests.map(r => r.hashedArguments ?? []).flat();
  const capsules = requests.map(r => r.capsules ?? []).flat();
  return {
    calls,
    authWitnesses,
    hashedArguments,
    capsules,
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
