import { type ContractArtifact, loadContractArtifact } from '@aztec/stdlib/abi';

import { makeProtocolContract } from '../make_protocol_contract.js';
import type { ProtocolContract } from '../protocol_contract.js';

export * from './contract_instance_published_event.js';
export * from './contract_instance_updated_event.js';

let protocolContract: ProtocolContract;
let protocolContractArtifact: ContractArtifact;

export async function getContractInstanceRegistryArtifact(): Promise<ContractArtifact> {
  if (!protocolContractArtifact) {
    // Cannot assert this import as it's incompatible with browsers
    // https://caniuse.com/mdn-javascript_statements_import_import_assertions_type_json
    // Use the new "with" syntax once supported by firefox
    // https://caniuse.com/mdn-javascript_statements_import_import_attributes_type_json
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
