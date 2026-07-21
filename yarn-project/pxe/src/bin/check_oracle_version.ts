import { keccak256String } from '@aztec/foundation/crypto/keccak';

import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { ORACLE_REGISTRY } from '../contract_function_simulator/index.js';
import { ORACLE_INTERFACE_HASH, ORACLE_VERSION_MAJOR } from '../oracle_version.js';
import { getOracleRegistrySignature, readNumericGlobal } from './oracle_version_helpers.js';

/**
 * Verifies that the Oracle interface matches the expected interface hash.
 *
 * The Oracle interface needs to be versioned to ensure compatibility between Aztec.nr and PXE. This function computes
<<<<<<< HEAD
 * a hash of the `ORACLE_REGISTRY` declaration (where each oracle's parameter names, parameter types, and return type
=======
 * a hash of `ORACLE_REGISTRY` (where each oracle's parameter names, parameter types, and return type
>>>>>>> origin/v5-next
 * live) and compares it against a known hash. If they don't match, it means the interface has changed and the oracle
 * version needs to be bumped:
 *   - If the change is backward-breaking (e.g. removing/renaming an oracle, or changing its params/return), bump
 *     ORACLE_VERSION_MAJOR.
 *   - If the change is an oracle addition (non-breaking), bump ORACLE_VERSION_MINOR.
 */
function assertOracleInterfaceMatches(): void {
<<<<<<< HEAD
  // The script runs from dest/bin/ after compilation, so we go up to the package root then into src/ to find
  // the source file.
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const packageRoot = dirname(dirname(currentDir)); // Go up from bin/ to pxe/
  const registrySourcePath = join(packageRoot, 'src/contract_function_simulator/oracle/oracle_registry.ts');

  const oracleInterfaceSignature = getOracleRegistrySignature(registrySourcePath, 'ORACLE_REGISTRY');

=======
>>>>>>> origin/v5-next
  // We use keccak256 here just because we already have it in the dependencies.
  const oracleInterfaceHash = keccak256String(getOracleRegistrySignature(ORACLE_REGISTRY));
  if (oracleInterfaceHash !== ORACLE_INTERFACE_HASH) {
    throw new Error(
      `The Oracle interface has changed. Update ORACLE_INTERFACE_HASH to ${oracleInterfaceHash} in pxe/src/oracle_version.ts and bump the oracle version (ORACLE_VERSION_MAJOR for breaking changes, ORACLE_VERSION_MINOR for oracle additions).`,
    );
  }
}

/**
 * Verifies that `ORACLE_VERSION_MAJOR` is identical across all of its hand-maintained copies.
 *
 * The major version is duplicated across the PXE TypeScript constant and two Noir constants (Aztec.nr and the protocol
 * contracts' `aztec_sublib`) because those layers can't import each other. This static check fails fast at build time,
 * naming each file and its value.
 *
 * Only the major version is checked: the minor version legitimately diverges under the "environment minor >= contract
 * minor" tolerance, so asserting minor equality would false-positive.
 */
function assertContractOracleVersionMajorInSync(): void {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  // Go up from dest/bin/ or src/bin/ to the package root (pxe/), then up two more to the git root.
  const packageRoot = dirname(dirname(currentDir));
  const gitRoot = join(packageRoot, '..', '..');

  const copies = [
    { label: 'pxe/src/oracle_version.ts', value: ORACLE_VERSION_MAJOR },
    {
      label: 'aztec-nr/aztec/src/oracle/version.nr',
      value: readNumericGlobal(
        join(gitRoot, 'noir-projects/aztec-nr/aztec/src/oracle/version.nr'),
        'ORACLE_VERSION_MAJOR',
      ),
    },
    {
      label: 'aztec_sublib/src/oracle/version.nr',
      value: readNumericGlobal(
        join(gitRoot, 'noir-projects/noir-contracts/contracts/protocol/aztec_sublib/src/oracle/version.nr'),
        'ORACLE_VERSION_MAJOR',
      ),
    },
  ];

  if (new Set(copies.map(copy => copy.value)).size > 1) {
    const details = copies.map(copy => `${copy.label}=${copy.value}`).join(', ');
    throw new Error(`ORACLE_VERSION_MAJOR is out of sync: ${details}. Bump all copies together.`);
  }
}

assertOracleInterfaceMatches();
assertContractOracleVersionMajorInSync();
