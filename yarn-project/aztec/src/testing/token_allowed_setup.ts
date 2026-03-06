import { TokenContractArtifact } from '@aztec/noir-contracts.js/Token';
import { buildAllowedElement } from '@aztec/p2p/msg_validators';
import { getContractClassFromArtifact } from '@aztec/stdlib/contract';
import type { AllowedElement } from '@aztec/stdlib/interfaces/server';

/**
 * Returns Token-specific allowlist entries needed for FPC-based fee payments.
 * These are test-only: FPC-based fee payment with custom tokens won't work on mainnet alpha.
 */
export async function getTokenAllowedSetupFunctions(): Promise<AllowedElement[]> {
  const tokenClassId = (await getContractClassFromArtifact(TokenContractArtifact)).id;
  const target = { classId: tokenClassId };
  return Promise.all([
    // Token: needed for private transfers via FPC (transfer_to_public enqueues this)
    buildAllowedElement(TokenContractArtifact, target, '_increase_public_balance', { onlySelf: true }),
    // Token: needed for public transfers via FPC (fee_entrypoint_public enqueues this)
    buildAllowedElement(TokenContractArtifact, target, 'transfer_in_public'),
  ]);
}
