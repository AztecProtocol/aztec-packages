import { type ProtocolContract, getCanonicalProtocolContract } from '../protocol_contract.js';

/** Returns the canonical deployment of the instance deployer contract. */
export async function getCanonicalInstanceDeployer(): Promise<ProtocolContract> {
  return await getCanonicalProtocolContract('ContractInstanceDeployer');
}
