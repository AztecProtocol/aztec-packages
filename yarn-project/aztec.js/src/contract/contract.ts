import type { ContractArtifact } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';

import type { Wallet } from '../wallet/wallet.js';
import { ContractBase } from './contract_base.js';
import { type DeployInstantiationOptions, DeployMethod } from './deploy_method.js';

/**
 * The Contract class represents a contract and provides utility methods for interacting with it.
 * It enables the creation of ContractFunctionInteraction instances for each function in the contract's ABI,
 * allowing users to call or send transactions to these functions. Additionally, the Contract class can be used
 * to attach the contract instance to a deployed contract onchain through the PXE, which facilitates
 * interaction with Aztec's privacy protocol.
 */
export class Contract extends ContractBase {
  /**
   * Gets a contract instance.
   *
   * This only builds a local handle for issuing calls; it does not register the contract with the wallet/PXE. To sync
   * the contract's private state or simulate its functions, register it explicitly (once) via
   * {@link Wallet.registerContract} — see that method for why registration is a deliberate step rather than automatic.
   * @param address - The address of the contract instance.
   * @param artifact - Build artifact of the contract.
   * @param wallet - The wallet to use when interacting with the contract.
   * @returns A promise that resolves to a new Contract instance.
   */
  public static at(address: AztecAddress, artifact: ContractArtifact, wallet: Wallet): Contract {
    return new Contract(address, artifact, wallet);
  }

  /**
   * Creates a tx to deploy (initialize and/or publish) a new instance of a contract.
   *
   * @param wallet - The wallet for executing the deployment.
   * @param artifact - Build artifact of the contract to deploy
   * @param args - Arguments for the constructor.
   * @param constructorName - The name of the constructor function to call.
   * @param instantiation - Other address-affecting parameters (salt, deployer / universalDeploy, publicKeys).
   */
  public static deploy(
    wallet: Wallet,
    artifact: ContractArtifact,
    args: any[],
    constructorName?: string,
    instantiation?: DeployInstantiationOptions,
  ) {
    const postDeployCtor = (instance: ContractInstanceWithAddress, wallet: Wallet) =>
      Contract.at(instance.address, artifact, wallet);
    return DeployMethod.create(
      wallet,
      { artifact, postDeployCtor, args, constructorNameOrArtifact: constructorName },
      instantiation,
    );
  }
}
