import { loadContractArtifact } from '@aztec/circuits.js/abi';
import { type NoirCompiledContract } from '@aztec/circuits.js/noir';

import AuthRegistryJson from '../../artifacts/AuthRegistry.json' assert { type: 'json' };
import { makeProtocolContract } from '../make_protocol_contract.js';
import { type ProtocolContract } from '../protocol_contract.js';

let protocolContract: ProtocolContract;

export const AuthRegistryArtifact = loadContractArtifact(AuthRegistryJson as NoirCompiledContract);

/** Returns the canonical deployment of the auth registry. */
export async function getCanonicalAuthRegistry(): Promise<ProtocolContract> {
  if (!protocolContract) {
    protocolContract = await makeProtocolContract('AuthRegistry', AuthRegistryArtifact);
  }
  return protocolContract;
}
