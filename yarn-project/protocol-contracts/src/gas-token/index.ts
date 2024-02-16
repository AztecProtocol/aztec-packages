import { AztecAddress } from '@aztec/circuits.js';

import { ProtocolContract, getCanonicalProtocolContract } from '../protocol_contract.js';
import { GasTokenArtifact } from './artifact.js';

/** Returns the canonical deployment of the gas token. */
export function getCanonicalGasToken(): ProtocolContract {
  return getCanonicalProtocolContract(GasTokenArtifact, 1);
}

export const GasTokenAddress = AztecAddress.fromString(
  '0x02704522409ff3c5bc18844e8152bb9f55c06ffde58fbba48ab985e7abf866d8',
);
