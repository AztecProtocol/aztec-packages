import { AztecAddress, DEPLOYER_CONTRACT_ADDRESS } from '@aztec/circuits.js';

import { type ProtocolContract, getCanonicalProtocolContract } from '../protocol_contract.js';
import { ContractInstanceDeployerArtifact } from './artifact.js';

/** Returns the canonical deployment of the instance deployer contract. */
export function getCanonicalInstanceDeployer(): ProtocolContract {
  const contract = getCanonicalProtocolContract(ContractInstanceDeployerArtifact, 1);
  if (!contract.address.equals(InstanceDeployerAddress)) {
    throw new Error(
      `Incorrect address for contract deployer (got ${contract.address.toString()} but expected ${InstanceDeployerAddress.toString()}).`,
    );
  }
  return contract;
}

export const InstanceDeployerAddress = AztecAddress.fromBigInt(DEPLOYER_CONTRACT_ADDRESS);
