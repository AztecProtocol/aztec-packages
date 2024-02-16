import { AztecAddress } from '@aztec/circuits.js';

import { ProtocolContract, getCanonicalProtocolContract } from '../protocol_contract.js';
import { ContractInstanceDeployerArtifact } from './artifact.js';

/** Returns the canonical deployment of the instance deployer contract. */
export function getCanonicalInstanceDeployer(): ProtocolContract {
  return getCanonicalProtocolContract(ContractInstanceDeployerArtifact, 1);
}

export const InstanceDeployerAddress = AztecAddress.fromString(
  '0x0d849757db16aa7d18d61ac4ea61488678dcfd55bf09b7126c5ceebfe751cc1f',
);
