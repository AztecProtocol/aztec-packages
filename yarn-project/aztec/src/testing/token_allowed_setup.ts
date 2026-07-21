import { TokenContractArtifact } from '@aztec/noir-contracts.js/Token';
import { buildAllowedElement } from '@aztec/p2p/msg_validators';
import type { ContractArtifact } from '@aztec/stdlib/abi';
import { getContractClassFromArtifact } from '@aztec/stdlib/contract';
import type { AllowedElement } from '@aztec/stdlib/interfaces/server';

/**
 * Returns the allowlist entries needed for FPC-based fee payments, keyed by the contract class of
 * the `artifact` actually deployed as the fee token (defaults to canonical Token). The setup-phase
 * validator matches these entries by class id, so a test deploying the codegen'd TestToken as its
 * fee vehicle must pass `TestTokenContract.artifact` here -- otherwise the FPC fee calls are matched
 * against the wrong class and rejected. Test-only: FPC fee payment with custom tokens won't work on
 * mainnet alpha.
 */
export async function getTokenAllowedSetupFunctions(
  artifact: ContractArtifact = TokenContractArtifact,
): Promise<AllowedElement[]> {
  const tokenClassId = (await getContractClassFromArtifact(artifact)).id;
  const target = { classId: tokenClassId };
  return Promise.all([
    // needed for private transfers via FPC (transfer_to_public enqueues this)
    buildAllowedElement(artifact, target, '_increase_public_balance', { onlySelf: true }),
    // needed for public transfers via FPC (fee_entrypoint_public enqueues this)
    buildAllowedElement(artifact, target, 'transfer_in_public'),
  ]);
}
