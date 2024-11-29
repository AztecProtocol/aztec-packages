import { type ProtocolContract, getCanonicalProtocolContract } from '../protocol_contract.js';

export * from './contract_instance_deployed_event.js';

/** Returns the canonical deployment of the instance deployer contract. */
export function getCanonicalInstanceDeployer(): ProtocolContract {
  return getCanonicalProtocolContract('ContractInstanceDeployer');
}
