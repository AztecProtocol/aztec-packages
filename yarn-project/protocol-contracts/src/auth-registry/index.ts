import { loadContractArtifact } from '@aztec/types/abi';
import { type NoirCompiledContract } from '@aztec/types/noir';

import AuthRegistryJson from '../../artifacts/AuthRegistry.json' assert { type: 'json' };
import { makeProtocolContract } from '../make_protocol_contract.js';
import { type ProtocolContract } from '../protocol_contract.js';

let protocolContract: ProtocolContract;

export const AuthRegistryArtifact = loadContractArtifact(AuthRegistryJson as NoirCompiledContract);

/** Returns the canonical deployment of the auth registry. */
export function getCanonicalAuthRegistry(): ProtocolContract {
  if (!protocolContract) {
    protocolContract = makeProtocolContract('AuthRegistry', AuthRegistryArtifact);
  }
  return protocolContract;
}
