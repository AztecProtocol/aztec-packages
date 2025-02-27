import { type ContractArtifact, loadContractArtifact } from '@aztec/stdlib/abi';

import { makeProtocolContract } from '../make_protocol_contract.js';
import type { ProtocolContract } from '../protocol_contract.js';

let protocolContract: ProtocolContract;
let protocolContractArtifact: ContractArtifact;

export async function getAuthRegistryArtifact(): Promise<ContractArtifact> {
  if (!protocolContractArtifact) {
    const { default: authRegistryJson } = await import('../../artifacts/AuthRegistry.json', {
      assert: { type: 'json' },
    });
    protocolContractArtifact = loadContractArtifact(authRegistryJson);
  }
  return protocolContractArtifact;
}

/** Returns the canonical deployment of the auth registry. */
export async function getCanonicalAuthRegistry(): Promise<ProtocolContract> {
  if (!protocolContract) {
    const authRegistryArtifact = await getAuthRegistryArtifact();
    protocolContract = await makeProtocolContract('AuthRegistry', authRegistryArtifact);
  }
  return protocolContract;
}
