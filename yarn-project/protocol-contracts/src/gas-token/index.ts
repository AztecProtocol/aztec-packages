import { type AztecAddress } from '@aztec/circuits.js';

import { type ProtocolContract, getCanonicalProtocolContract } from '../protocol_contract.js';
import { GasTokenArtifact } from './artifact.js';

/** Returns the canonical deployment of the gas token. */
export function getCanonicalGasToken(): ProtocolContract {
  return getCanonicalProtocolContract(GasTokenArtifact, 1);
}

export function getCanonicalGasTokenAddress(): AztecAddress {
  return getCanonicalGasToken().address;
}

export { GasTokenArtifact };
