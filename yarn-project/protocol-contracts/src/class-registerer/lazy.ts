import { type ContractArtifact, loadContractArtifact } from '@aztec/stdlib/abi';

import { makeProtocolContract } from '../make_protocol_contract.js';
import type { ProtocolContract } from '../protocol_contract.js';

export * from './contract_class_registered_event.js';
export * from './private_function_broadcasted_event.js';
export * from './unconstrained_function_broadcasted_event.js';

let protocolContract: ProtocolContract;
let protocolContractArtifact: ContractArtifact;

export async function getContractClassRegistererArtifact(): Promise<ContractArtifact> {
  if (!protocolContractArtifact) {
    // Cannot assert this import as it's incompatible with browsers
    // https://caniuse.com/mdn-javascript_statements_import_import_assertions_type_json
    // Use the new "with" syntax once supported by firefox
    // https://caniuse.com/mdn-javascript_statements_import_import_attributes_type_json
    // In the meantime, this lazy import is INCOMPATIBLE WITH NODEJS
    const { default: contractClassRegistererJson } = await import('../../artifacts/ContractClassRegisterer.json');
    protocolContractArtifact = loadContractArtifact(contractClassRegistererJson);
  }
  return protocolContractArtifact;
}

/** Returns the canonical deployment of the auth registry. */
export async function getCanonicalClassRegisterer(): Promise<ProtocolContract> {
  if (!protocolContract) {
    const contractClassRegistererArtifact = await getContractClassRegistererArtifact();
    protocolContract = await makeProtocolContract('ContractClassRegisterer', contractClassRegistererArtifact);
  }
  return protocolContract;
}
