import { type ProtocolContract, getCanonicalProtocolContract } from '../protocol_contract.js';

/** Returns the canonical deployment of the instance deployer contract. */
export function getCanonicalInstanceDeployer(): ProtocolContract {
  return getCanonicalProtocolContract('ContractInstanceDeployer');
}
