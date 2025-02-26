import type { AccountContract, AccountInterface, AuthWitnessProvider } from '@aztec/aztec.js/account';
import type { ContractArtifact } from '@aztec/stdlib/abi';
import type { CompleteAddress, NodeInfo } from '@aztec/stdlib/contract';

import { DefaultAccountInterface } from '../defaults/account_interface.js';

/**
 * Base class for implementing an account contract. Requires that the account uses the
 * default entrypoint method signature.
 */
export abstract class DefaultAccountContract implements AccountContract {
  abstract getAuthWitnessProvider(address: CompleteAddress): AuthWitnessProvider;
  abstract getDeploymentArgs(): Promise<any[] | undefined>;

  constructor(private artifact: ContractArtifact) {}

  getContractArtifact(): ContractArtifact {
    return this.artifact;
  }

  getInterface(address: CompleteAddress, nodeInfo: NodeInfo): AccountInterface {
    return new DefaultAccountInterface(this.getAuthWitnessProvider(address), address, nodeInfo);
  }
}
