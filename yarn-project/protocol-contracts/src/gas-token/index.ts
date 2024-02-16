import { AztecAddress } from '@aztec/circuits.js';

import { ProtocolContract, getCanonicalProtocolContract } from '../protocol_contract.js';
import { GasTokenArtifact } from './artifact.js';

/** Returns the canonical deployment of the gas token. */
export function getCanonicalGasToken(): ProtocolContract {
  return getCanonicalProtocolContract(GasTokenArtifact, 1);
}

export const GasTokenAddress = AztecAddress.fromString(
  '0x28d41e4feb2187a2083318713f96355e2f4c0d14d498965be9d98f199c80c2d5',
);
