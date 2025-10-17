import type { AuthWitnessProvider, ChainInfo } from '@aztec/entrypoints/interfaces';
import { Fr } from '@aztec/foundation/fields';
import type { ContractArtifact } from '@aztec/stdlib/abi';
import type { CompleteAddress } from '@aztec/stdlib/contract';
import { getContractInstanceFromInstantiationParams } from '@aztec/stdlib/contract';
import { deriveKeys } from '@aztec/stdlib/keys';

import type { AccountInterface } from './interface.js';

/**
 * Defines a deployable account contract with custom authentication and transaction handling logic.
 *
 * @remarks
 * AccountContract is the primary interface for implementing custom account contracts in Aztec.
 * It encapsulates all aspects of account contract deployment and usage:
 *
 * - **Contract Metadata**: Artifact, initialization parameters
 * - **Account Interface Creation**: Factory for AccountInterface instances
 * - **Authorization**: Witness provider for signing operations
 *
 * Account contracts enable account abstraction, allowing developers to implement custom:
 * - Authentication schemes (single-sig, multi-sig, social recovery, biometrics, etc.)
 * - Transaction validation logic
 * - Fee payment strategies
 * - Session key management
 * - Spending limits and guardrails
 *
 * Common account contract implementations:
 * - Schnorr signature accounts (single key)
 * - ECDSA accounts (Ethereum-compatible)
 * - Multi-signature accounts
 * - Timelock accounts
 * - Recoverable accounts
 *
 * @example
 * ```typescript
 * class SchnorrAccountContract implements AccountContract {
 *   constructor(private signingKey: GrumpkinPrivateKey) {}
 *
 *   async getContractArtifact() {
 *     return SchnorrAccountContractArtifact;
 *   }
 *
 *   async getInitializationFunctionAndArgs() {
 *     const signingPubKey = derivePublicKey(this.signingKey);
 *     return {
 *       constructorName: 'constructor',
 *       constructorArgs: [signingPubKey]
 *     };
 *   }
 *
 *   getInterface(address: CompleteAddress, chainInfo: ChainInfo): AccountInterface {
 *     return new SchnorrAccountInterface(address, this.signingKey, chainInfo);
 *   }
 *
 *   getAuthWitnessProvider(address: CompleteAddress): AuthWitnessProvider {
 *     return new SchnorrAuthWitnessProvider(this.signingKey);
 *   }
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Multi-signature account contract
 * class MultiSigAccountContract implements AccountContract {
 *   constructor(
 *     private signers: GrumpkinPrivateKey[],
 *     private threshold: number
 *   ) {}
 *
 *   async getInitializationFunctionAndArgs() {
 *     const signerPubKeys = this.signers.map(derivePublicKey);
 *     return {
 *       constructorName: 'constructor',
 *       constructorArgs: [signerPubKeys, this.threshold]
 *     };
 *   }
 *   // ... other methods
 * }
 * ```
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
   * @param chainInfo - Chain id and version of the rollup where the account contract is initialized / published.
   * @returns An account interface instance for creating tx requests and authorizing actions.
   */
  getInterface(address: CompleteAddress, chainInfo: ChainInfo): AccountInterface;

  /**
   * Returns the auth witness provider for the given address.
   * @param address - Address for which to create auth witnesses.
   */
  getAuthWitnessProvider(address: CompleteAddress): AuthWitnessProvider;
}

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
