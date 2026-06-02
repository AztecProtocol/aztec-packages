import { keccak256String } from '@aztec/foundation/crypto/keccak';
import { getOracleInterfaceSignature, readNumericGlobal } from '@aztec/pxe/bin';

import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { TXE_ORACLE_INTERFACE_HASH, TXE_ORACLE_VERSION_MAJOR } from '../txe_oracle_version.js';

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

/**
 * Verifies that `TXE_ORACLE_VERSION_MAJOR` is identical across its two hand-maintained copies: the TXE TypeScript
 * constant and the Aztec.nr Noir test helper constant. These layers can't import each other, so the major version is
 * duplicated by hand and a mismatch otherwise only surfaces at runtime. This is the TXE counterpart of the contract
 * oracle version check in `pxe/src/bin/check_oracle_version.ts`; the two version families are tracked separately.
 *
 * Only the major version is checked: the minor version legitimately diverges under the "environment minor >= contract
 * minor" tolerance, so asserting minor equality would false-positive.
 */
function assertTxeOracleVersionMajorInSync(): void {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  // Go up from dest/bin/ or src/bin/ to the package root (txe/), then up two more to the git root.
  const packageRoot = dirname(dirname(currentDir));
  const gitRoot = join(packageRoot, '..', '..');

  const copies = [
    { label: 'txe/src/txe_oracle_version.ts', value: TXE_ORACLE_VERSION_MAJOR },
    {
      label: 'aztec-nr/aztec/src/test/helpers/txe_oracles.nr',
      value: readNumericGlobal(
        join(gitRoot, 'noir-projects/aztec-nr/aztec/src/test/helpers/txe_oracles.nr'),
        'TXE_ORACLE_VERSION_MAJOR',
      ),
    },
  ];

  if (new Set(copies.map(copy => copy.value)).size > 1) {
    const details = copies.map(copy => `${copy.label}=${copy.value}`).join(', ');
    throw new Error(`TXE_ORACLE_VERSION_MAJOR is out of sync: ${details}. Bump all copies together.`);
  }
}

assertTxeOracleInterfaceMatches();
assertTxeOracleVersionMajorInSync();
