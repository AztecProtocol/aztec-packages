import { type ContractArtifact, loadContractArtifact } from '@aztec/stdlib/abi';

import { makeProtocolContract } from '../make_protocol_contract.js';
import type { ProtocolContract } from '../protocol_contract.js';

export * from './contract_instance_published_event.js';
export * from './contract_instance_updated_event.js';

let protocolContract: ProtocolContract;
let protocolContractArtifact: ContractArtifact;

export async function getContractInstanceRegistryArtifact(): Promise<ContractArtifact> {
  if (!protocolContractArtifact) {
    // Cannot assert this import as it's incompatible with bundlers like vite
    // https://github.com/vitejs/vite/issues/19095#issuecomment-2566074352
    // Even if now supported by al major browsers, the MIME type is replaced with
    // "text/javascript"
    // In the meantime, this lazy import is INCOMPATIBLE WITH NODEJS
    const { default: contractInstanceRegistryJson } = await import('../../artifacts/ContractInstanceRegistry.json');
    protocolContractArtifact = loadContractArtifact(contractInstanceRegistryJson);
  }
  return protocolContractArtifact;
}

/** Returns the canonical deployment of the auth registry. */
export async function getCanonicalInstanceRegistry(): Promise<ProtocolContract> {
  if (!protocolContract) {
    const contractInstanceRegistryArtifact = await getContractInstanceRegistryArtifact();
    protocolContract = await makeProtocolContract('ContractInstanceRegistry', contractInstanceRegistryArtifact);
  }
  return protocolContract;
}
