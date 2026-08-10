import { keccak256String } from '@aztec/foundation/crypto/keccak';
import { getOracleRegistrySignature } from '@aztec/pxe/bin';
import { ORACLE_REGISTRY, type OracleRegistryEntry } from '@aztec/pxe/simulator';

import { TXE_ORACLE_REGISTRY } from '../oracle/txe_oracle_registry.js';
import { TXE_ORACLE_INTERFACE_HASH } from '../oracle/txe_oracle_version.js';

/**
 * Verifies that the TXE oracle interfaces match the expected interface hash.
 *
 * The TXE oracle interfaces need to be versioned to ensure compatibility between Aztec.nr tests and TXE. This function
 * computes a hash of the TXE-specific entries in `TXE_ORACLE_REGISTRY` (the shared PXE entries are covered by the PXE
 * oracle version check) and compares it against a known hash. If they don't match, it means an
 * interface has changed and the TXE oracle version needs to be bumped:
 *   - If the change is backward-breaking (e.g. removing/renaming an oracle), bump TXE_ORACLE_VERSION_MAJOR.
 *   - If the change is an oracle addition (non-breaking), bump TXE_ORACLE_VERSION_MINOR.
 */
function assertTxeOracleInterfaceMatches(): void {
  const txeOnlyEntries: Record<string, OracleRegistryEntry> = Object.fromEntries(
    Object.entries(TXE_ORACLE_REGISTRY).filter(([name]) => !(name in ORACLE_REGISTRY)),
  );

  const txeOracleInterfaceHash = keccak256String(getOracleRegistrySignature(txeOnlyEntries));
  if (txeOracleInterfaceHash !== TXE_ORACLE_INTERFACE_HASH) {
    throw new Error(
      `The TXE oracle interface has changed. Update TXE_ORACLE_INTERFACE_HASH to ${txeOracleInterfaceHash} in txe/src/oracle/txe_oracle_version.ts and bump the TXE oracle version (TXE_ORACLE_VERSION_MAJOR for breaking changes, TXE_ORACLE_VERSION_MINOR for oracle additions).`,
    );
  }
}

assertTxeOracleInterfaceMatches();
