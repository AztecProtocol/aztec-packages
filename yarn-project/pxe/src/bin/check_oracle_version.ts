import { keccak256String } from '@aztec/foundation/crypto';

import deterministicStringify from 'json-stringify-deterministic';

import { Oracle } from '../contract_function_simulator/oracle/oracle.js';
import { TypedOracle } from '../contract_function_simulator/oracle/typed_oracle.js';
import { ORACLE_INTERFACE_HASH } from '../oracle_version.js';

// Create a minimal mock implementation of TypedOracle to instantiate the Oracle class for interface verification.
class OracleMock extends TypedOracle {}

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
  const oracle = new Oracle(new OracleMock('OracleMock'));
  // We use keccak256 here just because we already have it in the dependencies.
  const oracleInterfaceHash = keccak256String(deterministicStringify(oracle.toACIRCallback()));
  if (oracleInterfaceHash !== ORACLE_INTERFACE_HASH) {
    // This check exists only to notify you when you need to update the ORACLE_VERSION constant.
    throw new Error(
      `The TypedOracle interface has changed, which implies a breaking change in the aztec.nr/PXE oracle interface. Update ORACLE_INTERFACE_HASH to ${oracleInterfaceHash} and bump ORACLE_VERSION in pxe/src/oracle_version.ts.`,
    );
  }
}

assertOracleInterfaceMatches();
