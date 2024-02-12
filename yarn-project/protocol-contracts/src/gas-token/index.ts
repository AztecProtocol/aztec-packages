import { AztecAddress } from '@aztec/circuits.js';

import { ProtocolContract, getCanonicalProtocolContract } from '../protocol_contract.js';
import { GasTokenArtifact } from './artifact.js';

/** Returns the canonical deployment of the gas token. */
export function getCanonicalGasToken(): ProtocolContract {
  return getCanonicalProtocolContract(GasTokenArtifact, 1);
}

export const GasTokenAddress = AztecAddress.fromString(
  '0x2955f468f8830390d4af08d9853c61a4c5b8db5d284e9fb9f764ee6877bdb42a',
);
