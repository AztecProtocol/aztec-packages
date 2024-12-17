import { loadContractArtifact } from '@aztec/types/abi';
import { type NoirCompiledContract } from '@aztec/types/noir';

import ContractInstanceDeployerJson from '../../artifacts/ContractInstanceDeployer.json' assert { type: 'json' };
import { makeProtocolContract } from '../make_protocol_contract.js';
import { type ProtocolContract } from '../protocol_contract.js';

export * from './contract_instance_deployed_event.js';

export const ContractInstanceDeployerArtifact = loadContractArtifact(
  ContractInstanceDeployerJson as NoirCompiledContract,
);

let protocolContract: ProtocolContract;

/** Returns the canonical deployment of the contract. */
export function getCanonicalInstanceDeployer(): ProtocolContract {
  if (!protocolContract) {
    protocolContract = makeProtocolContract('ContractInstanceDeployer', ContractInstanceDeployerArtifact);
  }
  return protocolContract;
}
