import { type ContractArtifact, loadContractArtifact } from '@aztec/stdlib/abi';

import { makeProtocolContract } from '../make_protocol_contract.js';
import type { ProtocolContract } from '../protocol_contract.js';

let protocolContract: ProtocolContract;
let protocolContractArtifact: ContractArtifact;

export async function getAuthRegistryArtifact(): Promise<ContractArtifact> {
  if (!protocolContractArtifact) {
    // Cannot assert this import as it's incompatible with browsers
    // https://caniuse.com/mdn-javascript_statements_import_import_assertions_type_json
    // Use the new "with" syntax once supported by firefox
    // https://caniuse.com/mdn-javascript_statements_import_import_attributes_type_json
    // In the meantime, this lazy import is INCOMPATIBLE WITH NODEJS
    const { default: authRegistryJson } = await import('../../artifacts/AuthRegistry.json');
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
