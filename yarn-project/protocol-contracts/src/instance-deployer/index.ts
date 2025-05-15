import { loadContractArtifact } from '@aztec/stdlib/abi';
import type { NoirCompiledContract } from '@aztec/stdlib/noir';

import ContractInstanceDeployerJson from '../../artifacts/ContractInstanceDeployer.json' with { type: 'json' };
import { makeProtocolContract } from '../make_protocol_contract.js';
import type { ProtocolContract } from '../protocol_contract.js';

export * from './contract_instance_deployed_event.js';
export * from './contract_instance_updated_event.js';

export const ContractInstanceDeployerArtifact = loadContractArtifact(
  ContractInstanceDeployerJson as NoirCompiledContract,
);

let protocolContract: ProtocolContract;

/** Returns the canonical deployment of the contract. */
export async function getCanonicalInstanceDeployer(): Promise<ProtocolContract> {
  if (!protocolContract) {
    protocolContract = await makeProtocolContract('ContractInstanceDeployer', ContractInstanceDeployerArtifact);
  }
  return protocolContract;
}
