import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { FeeJuiceArtifact } from '@aztec/protocol-contracts/fee-juice';
import { AuthRegistryArtifact, STANDARD_AUTH_REGISTRY_ADDRESS } from '@aztec/standard-contracts/auth-registry';
import type { AllowedElement } from '@aztec/stdlib/interfaces/server';

import { buildAllowedElement } from './allowed_setup_helpers.js';

let defaultAllowedSetupFunctions: AllowedElement[] | undefined;

/** Returns the default list of functions allowed to run in the setup phase of a transaction. */
export async function getDefaultAllowedSetupFunctions(): Promise<AllowedElement[]> {
  if (defaultAllowedSetupFunctions === undefined) {
    defaultAllowedSetupFunctions = await Promise.all([
      // AuthRegistry: needed for authwit support via private path (set_authorized_private enqueues _set_authorized)
      buildAllowedElement(AuthRegistryArtifact, { address: STANDARD_AUTH_REGISTRY_ADDRESS }, '_set_authorized', {
        onlySelf: true,
        rejectNullMsgSender: true,
      }),
      // AuthRegistry: needed for authwit support via public path (PublicFeePaymentMethod calls set_authorized directly)
      buildAllowedElement(AuthRegistryArtifact, { address: STANDARD_AUTH_REGISTRY_ADDRESS }, 'set_authorized', {
        rejectNullMsgSender: true,
      }),
      // FeeJuice: needed for claiming on the same tx as a spend (claim_and_end_setup enqueues this)
      buildAllowedElement(FeeJuiceArtifact, { address: ProtocolContractAddress.FeeJuice }, '_increase_public_balance', {
        onlySelf: true,
      }),
    ]);
  }
  return defaultAllowedSetupFunctions;
}
