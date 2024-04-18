import { AztecAddress, DEPLOYER_CONTRACT_ADDRESS } from '@aztec/circuits.js';
import { createDebugLogger } from '@aztec/foundation/log';

import { type ProtocolContract, getCanonicalProtocolContract } from '../protocol_contract.js';
import { ContractInstanceDeployerArtifact } from './artifact.js';

/** Returns the canonical deployment of the instance deployer contract. */
export function getCanonicalInstanceDeployer(): ProtocolContract {
  createDebugLogger('aztec:protocol-contracts:instance-deployer').debug(
    `Deployer artifact: ${JSON.stringify(ContractInstanceDeployerArtifact)}`,
  );
  const contract = getCanonicalProtocolContract(ContractInstanceDeployerArtifact, 1);
  if (!contract.address.equals(InstanceDeployerAddress)) {
    throw new Error(
      `Incorrect address for contract deployer (got ${contract.address.toString()} but expected ${InstanceDeployerAddress.toString()}). Check DEPLOYER_CONTRACT_ADDRESS is set to the correct value in the constants files and run the protocol-contracts package tests.`,
    );
  }
  return contract;
}

export const InstanceDeployerAddress = AztecAddress.fromBigInt(DEPLOYER_CONTRACT_ADDRESS);
