import { loadContractArtifact } from '@aztec/stdlib/abi';
import type { NoirCompiledContract } from '@aztec/stdlib/noir';

import HandshakeRegistryJson from '../../artifacts/HandshakeRegistry.json' with { type: 'json' };
import { makeStandardContract } from '../make_standard_contract.js';
import type { StandardContract } from '../standard_contract.js';

export {
  STANDARD_HANDSHAKE_REGISTRY_ADDRESS,
  STANDARD_HANDSHAKE_REGISTRY_CLASS_ID,
  STANDARD_HANDSHAKE_REGISTRY_SALT,
} from './constants.js';

export const HandshakeRegistryArtifact = loadContractArtifact(HandshakeRegistryJson as NoirCompiledContract);

let standardContract: StandardContract;

/** Returns the standard deployment of the handshake registry. */
export function getStandardHandshakeRegistry(): Promise<StandardContract> {
  if (!standardContract) {
    standardContract = makeStandardContract('HandshakeRegistry', HandshakeRegistryArtifact);
  }
  return Promise.resolve(standardContract);
}
