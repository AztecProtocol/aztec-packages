import { type ContractArtifact, loadContractArtifact } from '@aztec/stdlib/abi';

import { makeProtocolContract } from '../make_protocol_contract.js';
import type { ProtocolContract } from '../protocol_contract.js';

export * from './contract_instance_deployed_event.js';
export * from './contract_instance_updated_event.js';

let protocolContract: ProtocolContract;
let protocolContractArtifact: ContractArtifact;

export async function getContractInstanceDeployerArtifact(): Promise<ContractArtifact> {
  if (!protocolContractArtifact) {
    const { default: contractInstanceDeployerJson } = await import('../../artifacts/ContractInstanceDeployer.json');
    protocolContractArtifact = loadContractArtifact(contractInstanceDeployerJson);
  }
  return protocolContractArtifact;
}

/** Returns the canonical deployment of the auth registry. */
export async function getCanonicalInstanceDeployer(): Promise<ProtocolContract> {
  if (!protocolContract) {
    const contractInstanceDeployerArtifact = await getContractInstanceDeployerArtifact();
    protocolContract = await makeProtocolContract('ContractInstanceDeployer', contractInstanceDeployerArtifact);
  }
  return protocolContract;
}
