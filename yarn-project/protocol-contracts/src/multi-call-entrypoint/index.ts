import { type AztecAddress } from '@aztec/circuits.js';

import { type ProtocolContract, getCanonicalProtocolContract } from '../protocol_contract.js';
import { MultiCallEntrypointArtifact } from './artifact.js';

export function getCanonicalMultiCallEntrypointContract(): ProtocolContract {
  return getCanonicalProtocolContract(MultiCallEntrypointArtifact, 1, []);
}

export function getCanonicalMultiCallEntrypointAddress(): AztecAddress {
  return getCanonicalMultiCallEntrypointContract().address;
}
