import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { STANDARD_AUTH_REGISTRY_ADDRESS } from '@aztec/standard-contracts/auth-registry/constants';
import { STANDARD_MULTI_CALL_ENTRYPOINT_ADDRESS } from '@aztec/standard-contracts/multi-call-entrypoint/constants';
import { STANDARD_PUBLIC_CHECKS_ADDRESS } from '@aztec/standard-contracts/public-checks/constants';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

/**
 * Canonical contracts that hold no private state and are therefore never synced.
 *
 * The protocol contracts (registries, fee juice) plus the standard AuthRegistry, MultiCallEntrypoint and PublicChecks
 * declare no notes and no events, so their macro-generated `sync_state` has nothing to discover.
 */
export const skipSyncContracts: AztecAddress[] = [
  ...Object.values(ProtocolContractAddress),
  STANDARD_AUTH_REGISTRY_ADDRESS,
  STANDARD_MULTI_CALL_ENTRYPOINT_ADDRESS,
  STANDARD_PUBLIC_CHECKS_ADDRESS,
];

/** Returns whether the given contract should be skipped during private state synchronization. */
export function isSkipSyncContract(address: AztecAddress): boolean {
  return skipSyncContracts.some(a => a.equals(address));
}
