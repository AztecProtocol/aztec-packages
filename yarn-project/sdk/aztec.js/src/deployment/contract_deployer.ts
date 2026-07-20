import type { ContractArtifact } from '@aztec/stdlib/abi';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';

import { Contract } from '../contract/contract.js';
import { type DeployInstantiationOptions, DeployMethod } from '../contract/deploy_method.js';
import type { Wallet } from '../wallet/wallet.js';

/**
 * A class for deploying contract.
 * @remarks Keeping this around even though we have Aztec.nr contract types because it can be useful for non-TS users.
 */
export class ContractDeployer {
  constructor(
    private artifact: ContractArtifact,
    private wallet: Wallet,
    private constructorName?: string,
  ) {}

  /**
   * Deploy a contract using the provided instantiation parameters and constructor arguments.
   * Creates a new DeployMethod instance that can be used to send the deployment transaction.
   *
   * The first argument is the {@link DeployInstantiationOptions} (salt, deployer) — pass `{}` to
   * accept defaults (random salt, deployer = AztecAddress.ZERO). The remaining arguments are the
   * constructor arguments for the contract.
   *
   * @param instantiation - Salt and deployer to mix into the address derivation.
   * @param args - The constructor arguments for the contract being deployed.
   * @returns A DeployMethod instance configured with the ABI, PXE, and constructor arguments.
   */
  public deploy(args?: any[], instantiation?: DeployInstantiationOptions) {
    const postDeployCtor = (instance: ContractInstanceWithAddress, wallet: Wallet) =>
      Contract.at(instance.address, this.artifact, wallet);
    return DeployMethod.create(
      this.wallet,
      { artifact: this.artifact, postDeployCtor, args, constructorNameOrArtifact: this.constructorName },
      instantiation,
    );
  }
}
