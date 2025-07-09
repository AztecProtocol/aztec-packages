import type { ContractArtifact } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { getContractClassFromArtifact } from '@aztec/stdlib/contract';
import { PublicKeys } from '@aztec/stdlib/keys';

import type { Wallet } from '../wallet/wallet.js';
import { ContractBase } from './contract_base.js';
import { DeployMethod } from './deploy_method.js';

/**
 * The Contract class represents a contract and provides utility methods for interacting with it.
 * It enables the creation of ContractFunctionInteraction instances for each function in the contract's ABI,
 * allowing users to call or send transactions to these functions. Additionally, the Contract class can be used
 * to attach the contract instance to a deployed contract on-chain through the PXE, which facilitates
 * interaction with Aztec's privacy protocol.
 */
export class Contract extends ContractBase {
  /**
   * Gets a contract instance.
   * @param address - The address of the contract instance.
   * @param artifact - Build artifact of the contract.
   * @param wallet - The wallet to use when interacting with the contract.
   * @returns A promise that resolves to a new Contract instance.
   */
  public static async at(address: AztecAddress, artifact: ContractArtifact, wallet: Wallet): Promise<Contract> {
    const instance = (await wallet.getContractMetadata(address)).contractInstance;
    if (instance === undefined) {
      throw new Error(`Contract instance at ${address.toString()} has not been registered in the wallet's PXE`);
    }
    const thisContractClass = await getContractClassFromArtifact(artifact);
    if (!thisContractClass.id.equals(instance.currentContractClassId)) {
      // wallet holds an outdated version of this contract
      await wallet.updateContract(address, artifact);
      instance.currentContractClassId = thisContractClass.id;
    }
    return new Contract(instance, artifact, wallet);
  }

  /**
   * Creates a tx to deploy (initialize and/or publish) a new instance of a contract.
   * @param wallet - The wallet for executing the deployment.
   * @param artifact - Build artifact of the contract to deploy
   * @param args - Arguments for the constructor.
   * @param constructorName - The name of the constructor function to call.
   */
  public static deploy(wallet: Wallet, artifact: ContractArtifact, args: any[], constructorName?: string) {
    const postDeployCtor = (address: AztecAddress, wallet: Wallet) => Contract.at(address, artifact, wallet);
    return new DeployMethod(PublicKeys.default(), wallet, artifact, postDeployCtor, args, constructorName);
  }

  /**
   * Creates a tx to deploy (initialize and/or publish) a new instance of a contract
   * using the specified public keys hash to derive the address.
   * @param publicKeys - Hash of public keys to use for deriving the address.
   * @param wallet - The wallet for executing the deployment.
   * @param artifact - Build artifact of the contract.
   * @param args - Arguments for the constructor.
   * @param constructorName - The name of the constructor function to call.
   */
  public static deployWithPublicKeys(
    publicKeys: PublicKeys,
    wallet: Wallet,
    artifact: ContractArtifact,
    args: any[],
    constructorName?: string,
  ) {
    const postDeployCtor = (address: AztecAddress, wallet: Wallet) => Contract.at(address, artifact, wallet);
    return new DeployMethod(publicKeys, wallet, artifact, postDeployCtor, args, constructorName);
  }
}
