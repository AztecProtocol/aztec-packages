import { type ContractArtifact, loadContractArtifact } from '@aztec/stdlib/abi';

import { makeStandardContract } from '../make_standard_contract.js';
import type { StandardContract } from '../standard_contract.js';

export {
  STANDARD_HANDSHAKE_REGISTRY_ADDRESS,
  STANDARD_HANDSHAKE_REGISTRY_CLASS_ID,
  STANDARD_HANDSHAKE_REGISTRY_SALT,
} from './constants.js';

let standardContract: StandardContract;
let standardContractArtifact: ContractArtifact;

export async function getHandshakeRegistryArtifact(): Promise<ContractArtifact> {
  if (!standardContractArtifact) {
    const { default: handshakeRegistryJson } = await import('../../artifacts/HandshakeRegistry.json', {
      with: { type: 'json' },
    });
    standardContractArtifact = loadContractArtifact(handshakeRegistryJson);
  }
  return standardContractArtifact;
}

/** Returns the standard deployment of the handshake registry. */
export async function getStandardHandshakeRegistry(): Promise<StandardContract> {
  if (!standardContract) {
    const artifact = await getHandshakeRegistryArtifact();
    standardContract = makeStandardContract('HandshakeRegistry', artifact);
  }
  return standardContract;
}
