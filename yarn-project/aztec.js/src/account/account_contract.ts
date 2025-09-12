import type { AuthWitnessProvider } from '@aztec/entrypoints/interfaces';
import { Fr } from '@aztec/foundation/fields';
import type { ContractArtifact } from '@aztec/stdlib/abi';
import type { CompleteAddress, NodeInfo } from '@aztec/stdlib/contract';
import { getContractInstanceFromInstantiationParams } from '@aztec/stdlib/contract';
import { deriveKeys } from '@aztec/stdlib/keys';

import type { AccountInterface } from './interface.js';

// docs:start:account-contract-interface
/**
 * An account contract instance. Knows its artifact, deployment arguments, how to create
 * transaction execution requests out of function calls, and how to authorize actions.
 */
export interface AccountContract {
  /**
   * Returns the artifact of this account contract.
   */
  getContractArtifact(): Promise<ContractArtifact>;

  /**
   * Returns the initializer function name and arguments for this instance, or undefined if this contract does not require initialization.
   */
  getInitializationFunctionAndArgs(): Promise<
    | {
        /** The name of the function used to initialize the contract */
        constructorName: string;
        /** The args to the function used to initialize the contract */
        constructorArgs: any[];
      }
    | undefined
  >;

  /**
   * Returns the account interface for this account contract given an instance at the provided address.
   * The account interface is responsible for assembling tx requests given requested function calls, and
   * for creating signed auth witnesses given action identifiers (message hashes).
   * @param address - Address of this account contract.
   * @param nodeInfo - Info on the chain where it is initialized / published.
   * @returns An account interface instance for creating tx requests and authorizing actions.
   */
  getInterface(address: CompleteAddress, nodeInfo: NodeInfo): AccountInterface;

  /**
   * Returns the auth witness provider for the given address.
   * @param address - Address for which to create auth witnesses.
   */
  getAuthWitnessProvider(address: CompleteAddress): AuthWitnessProvider;
}
// docs:end:account-contract-interface

/**
 * Compute the address of an account contract from secret and salt.
 */
export async function getAccountContractAddress(accountContract: AccountContract, secret: Fr, salt: Fr) {
  const { publicKeys } = await deriveKeys(secret);
  const { constructorName, constructorArgs } = (await accountContract.getInitializationFunctionAndArgs()) ?? {
    constructorName: undefined,
    constructorArgs: undefined,
  };
  const artifact = await accountContract.getContractArtifact();
  const instance = await getContractInstanceFromInstantiationParams(artifact, {
    constructorArtifact: constructorName,
    constructorArgs,
    salt,
    publicKeys,
  });
  return instance.address;
}
