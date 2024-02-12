import { AztecAddress } from '@aztec/circuits.js';

import { ProtocolContract, getCanonicalProtocolContract } from '../protocol_contract.js';
import { GasTokenArtifact } from './artifact.js';

/** Returns the canonical deployment of the gas token. */
export function getCanonicalGasToken(): ProtocolContract {
  return getCanonicalProtocolContract(GasTokenArtifact, 1);
}

export const GasTokenAddress = AztecAddress.fromString(
  '0x0fc032f128fe98dc86f58f134903342d074b8fea3496d855ef9d2ecbc0865916',
);
