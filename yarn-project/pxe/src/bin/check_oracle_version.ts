import { keccak256String } from '@aztec/foundation/crypto';

import { Oracle } from '../contract_function_simulator/oracle/oracle.js';
import { ORACLE_INTERFACE_HASH } from '../oracle_version.js';

/**
 * Verifies that the Oracle interface matches the expected interface hash.
 *
 * The Oracle interface needs to be versioned to ensure compatibility between Aztec.nr and PXE. This function computes
 * a hash of the Oracle interface and compares it against a known hash. If they don't match, it means the interface has
 * changed and the ORACLE_VERSION constant needs to be incremented and the ORACLE_INTERFACE_HASH constant needs to be
 * updated.
 *
 * TODO(#16581): The following only takes into consideration changes to the oracles defined in Oracle.ts and omits TXE
 * oracles. Ensure this checks TXE oracles as well. This hasn't been implemented yet since we don't have a clean TXE
 * oracle interface like we do in PXE (i.e., there is no single Oracle class that contains only the oracles).
 */
function assertOracleInterfaceMatches(): void {
  const excludedProps = [
    'handler',
    'constructor',
    'toACIRCallback',
    'handlerAsMisc',
    'handlerAsUtility',
    'handlerAsPrivate',
  ] as const;

  // Create a hashable representation of the oracle interface by concatenating its method names. Return values are
  // excluded from the hash calculation since they are typically arrays of fields and I didn't manage to reliably
  // stringify them.
  // TODO(#16581): we're only checking the functions implemented by the Oracle object, which is really an ACVM
  // translator, akin to TXE's RPC translator. This is correct in that it is ultimately the foreign interface that
  // matters, but incorrect in that it does not take into consideration TXE's extended interface. An improvement would
  // be to check RPCTranslator from TXE, though that still seems a bit fragile.
  const oracleInterfaceMethodNames = Object.getOwnPropertyNames(Oracle.prototype)
    .filter(name => !excludedProps.includes(name as (typeof excludedProps)[number]))
    .sort()
    .join('');

  // We use keccak256 here just because we already have it in the dependencies.
  const oracleInterfaceHash = keccak256String(oracleInterfaceMethodNames);
  if (oracleInterfaceHash !== ORACLE_INTERFACE_HASH) {
    // This check exists only to notify you when you need to update the ORACLE_VERSION constant.
    throw new Error(
      `The Oracle interface has changed, which implies a breaking change in the aztec.nr/PXE oracle interface. Update ORACLE_INTERFACE_HASH to ${oracleInterfaceHash} and bump ORACLE_VERSION in pxe/src/oracle_version.ts.`,
    );
  }
}

assertOracleInterfaceMatches();
