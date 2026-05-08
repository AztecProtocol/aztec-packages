import { type ContractArtifact, loadContractArtifact } from '@aztec/stdlib/abi';
import type { NoirCompiledContract } from '@aztec/stdlib/noir';

import AuthRegistryJson from '../../artifacts/AuthRegistry.json' with { type: 'json' };
import { makeProtocolContract } from '../make_protocol_contract.js';
import type { ProtocolContract } from '../protocol_contract.js';

let protocolContract: ProtocolContract;

export const AuthRegistryArtifact: ContractArtifact = loadContractArtifact(AuthRegistryJson as NoirCompiledContract);

/** Returns the canonical deployment of the auth registry. */
export function getCanonicalAuthRegistry(): Promise<ProtocolContract> {
  if (!protocolContract) {
    protocolContract = makeProtocolContract('AuthRegistry', AuthRegistryArtifact);
  }
  return Promise.resolve(protocolContract);
}
