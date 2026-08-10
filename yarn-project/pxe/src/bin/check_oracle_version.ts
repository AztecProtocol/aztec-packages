import { keccak256String } from '@aztec/foundation/crypto/keccak';

import { ORACLE_REGISTRY } from '../contract_function_simulator/index.js';
import { ORACLE_INTERFACE_HASH } from '../oracle_version.js';
import { getOracleRegistrySignature } from './oracle_version_helpers.js';

/**
 * Verifies that the Oracle interface matches the expected interface hash.
 *
 * The Oracle interface needs to be versioned to ensure compatibility between Aztec.nr and PXE. This function computes
 * a hash of `ORACLE_REGISTRY` (where each oracle's parameter names, parameter types, and return type
 * live) and compares it against a known hash. If they don't match, it means the interface has changed and the oracle
 * version needs to be bumped:
 *   - If the change is backward-breaking (e.g. removing/renaming an oracle, or changing its params/return), bump
 *     ORACLE_VERSION_MAJOR.
 *   - If the change is an oracle addition (non-breaking), bump ORACLE_VERSION_MINOR.
 */
function assertOracleInterfaceMatches(): void {
  // We use keccak256 here just because we already have it in the dependencies.
  const oracleInterfaceHash = keccak256String(getOracleRegistrySignature(ORACLE_REGISTRY));
  if (oracleInterfaceHash !== ORACLE_INTERFACE_HASH) {
    throw new Error(
      `The Oracle interface has changed. Update ORACLE_INTERFACE_HASH to ${oracleInterfaceHash} in pxe/src/oracle_version.ts and bump the oracle version (ORACLE_VERSION_MAJOR for breaking changes, ORACLE_VERSION_MINOR for oracle additions).`,
    );
  }
}

assertOracleInterfaceMatches();
