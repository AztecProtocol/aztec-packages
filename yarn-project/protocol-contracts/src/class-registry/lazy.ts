import { type ContractArtifact, loadContractArtifact } from '@aztec/stdlib/abi';

import { makeProtocolContract } from '../make_protocol_contract.js';
import type { ProtocolContract } from '../protocol_contract.js';

export * from './contract_class_published_event.js';
export * from './private_function_broadcasted_event.js';
export * from './utility_function_broadcasted_event.js';

let protocolContract: ProtocolContract;
let protocolContractArtifact: ContractArtifact;

export async function getContractClassRegistryArtifact(): Promise<ContractArtifact> {
  if (!protocolContractArtifact) {
    // Cannot assert this import as it's incompatible with bundlers like vite
    // https://github.com/vitejs/vite/issues/19095#issuecomment-2566074352
    // Even if now supported by al major browsers, the MIME type is replaced with
    // "text/javascript"
    // In the meantime, this lazy import is INCOMPATIBLE WITH NODEJS
    const { default: contractClassRegistryJson } = await import('../../artifacts/ContractClassRegistry.json');
    protocolContractArtifact = loadContractArtifact(contractClassRegistryJson);
  }
  return protocolContractArtifact;
}

/** Returns the canonical deployment of the auth registry. */
export async function getCanonicalClassRegistry(): Promise<ProtocolContract> {
  if (!protocolContract) {
    const contractClassRegistryArtifact = await getContractClassRegistryArtifact();
    protocolContract = await makeProtocolContract('ContractClassRegistry', contractClassRegistryArtifact);
  }
  return protocolContract;
}
