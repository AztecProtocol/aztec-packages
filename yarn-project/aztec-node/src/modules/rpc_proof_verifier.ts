import { BBCircuitVerifier, type BBConfig, QueuedIVCVerifier } from '@aztec/bb-prover';
import { TestCircuitVerifier } from '@aztec/bb-prover/test';
import type { ClientProtocolCircuitVerifier } from '@aztec/stdlib/interfaces/server';

import type { AztecNodeConfig } from '../aztec-node/config.js';

/** The slice of the node config that selects and parameterizes the RPC-side proof verifier. */
export type RpcProofVerifierConfig = BBConfig &
  Pick<
    AztecNodeConfig,
    'realProofs' | 'debugForceTxProofVerification' | 'numConcurrentIVCVerifiers' | 'proverTestVerificationDelayMs'
  >;

/**
 * Whether the config calls for real proof verifiers: either the network runs real proofs, or verification is
 * being forced for debugging on a network that does not.
 */
export function usesRealProofVerifiers(
  config: Pick<AztecNodeConfig, 'realProofs' | 'debugForceTxProofVerification'>,
): boolean {
  return !!(config.realProofs || config.debugForceTxProofVerification);
}

/**
 * Builds the verifier for client proofs received over RPC, shared by the full-node and follower factories and
 * by config updates that flip {@link usesRealProofVerifiers}. Real verification runs BB behind a queue that
 * bounds concurrent verifications; otherwise a test verifier that accepts everything stands in.
 */
export function createRpcProofVerifier(config: RpcProofVerifierConfig): Promise<ClientProtocolCircuitVerifier> {
  return usesRealProofVerifiers(config)
    ? BBCircuitVerifier.new(config).then(verifier => new QueuedIVCVerifier(verifier, config.numConcurrentIVCVerifiers))
    : Promise.resolve(new TestCircuitVerifier(config.proverTestVerificationDelayMs));
}
