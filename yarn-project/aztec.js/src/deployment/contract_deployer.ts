import type { ContractArtifact } from '@aztec/stdlib/abi';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import { PublicKeys } from '@aztec/stdlib/keys';

import { Contract } from '../contract/contract.js';
import { DeployMethod } from '../contract/deploy_method.js';
import type { Wallet } from '../wallet/wallet.js';

/**
 * A class for deploying contract.
 * @remarks Keeping this around even though we have Aztec.nr contract types because it can be useful for non-TS users.
 */
export class ContractDeployer {
  constructor(
    private artifact: ContractArtifact,
    private wallet: Wallet,
    private publicKeys?: PublicKeys,
    private constructorName?: string,
  ) {}

  /**
   * Deploy a contract using the provided ABI and constructor arguments.
   * This function creates a new DeployMethod instance that can be used to send deployment transactions
   * and query deployment status. The method accepts any number of constructor arguments, which will
   * be passed to the contract's constructor during deployment.
   *
   * @param args - The constructor arguments for the contract being deployed.
   * @returns A DeployMethod instance configured with the ABI, PXE, and constructor arguments.
   */
  public deploy(...args: any[]) {
    const postDeployCtor = (instance: ContractInstanceWithAddress, wallet: Wallet) =>
      Contract.at(instance.address, this.artifact, wallet);
    return new DeployMethod(
      this.publicKeys ?? PublicKeys.default(),
      this.wallet,
      this.artifact,
      postDeployCtor,
      args,
      this.constructorName,
    );
  }
}
