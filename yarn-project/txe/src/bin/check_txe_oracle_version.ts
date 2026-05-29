import { keccak256String } from '@aztec/foundation/crypto/keccak';
import { getOracleInterfaceSignature } from '@aztec/pxe/bin';

import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { TXE_ORACLE_INTERFACE_HASH } from '../txe_oracle_version.js';

/**
 * Verifies that the TXE oracle interfaces match the expected interface hash.
 *
 * The TXE oracle interfaces need to be versioned to ensure compatibility between Aztec.nr tests and TXE. This function
 * computes a hash of the TXE oracle interfaces and compares it against a known hash. If they don't match, it means an
 * interface has changed and the TXE oracle version needs to be bumped:
 *   - If the change is backward-breaking (e.g. removing/renaming an oracle), bump TXE_ORACLE_VERSION_MAJOR.
 *   - If the change is an oracle addition (non-breaking), bump TXE_ORACLE_VERSION_MINOR.
 */
function assertTxeOracleInterfaceMatches(): void {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const packageRoot = dirname(dirname(currentDir));
  const interfacesSourcePath = join(packageRoot, 'src/oracle/interfaces.ts');

  const targets = ['IAvmExecutionOracle', 'ITxeExecutionOracle'];
  // Not an oracle foreign call handler (see TODO(F-335) in interfaces.ts).
  const excludedMembers = ['syncContractNonOracleMethod'];

  const txeOracleInterfaceSignature = getOracleInterfaceSignature(interfacesSourcePath, targets, excludedMembers);

  const txeOracleInterfaceHash = keccak256String(txeOracleInterfaceSignature);
  if (txeOracleInterfaceHash !== TXE_ORACLE_INTERFACE_HASH) {
    throw new Error(
      `The TXE oracle interface has changed. Update TXE_ORACLE_INTERFACE_HASH to ${txeOracleInterfaceHash} in txe/src/txe_oracle_version.ts and bump the TXE oracle version (TXE_ORACLE_VERSION_MAJOR for breaking changes, TXE_ORACLE_VERSION_MINOR for oracle additions).`,
    );
  }
}

assertTxeOracleInterfaceMatches();
