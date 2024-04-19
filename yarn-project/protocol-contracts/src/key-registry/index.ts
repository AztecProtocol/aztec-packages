import { type AztecAddress } from '@aztec/circuits.js';

import { type ProtocolContract, getCanonicalProtocolContract } from '../protocol_contract.js';
import { KeyRegistryArtifact } from './artifact.js';

/** Returns the canonical deployment of the gas token. */
export function getCanonicalKeyRegistry(): ProtocolContract {
  return getCanonicalProtocolContract(KeyRegistryArtifact, 1337);
}

export function getCanonicalKeyRegistryAddress(): AztecAddress {
  return getCanonicalKeyRegistry().address;
}
