import type { AccountContract, AccountInterface, AuthWitnessProvider, ChainInfo } from '@aztec/aztec.js/account';
import type { ContractArtifact } from '@aztec/stdlib/abi';
import type { CompleteAddress } from '@aztec/stdlib/contract';

import { DefaultAccountInterface } from '../defaults/account_interface.js';

/**
 * Base class for implementing account contracts using the default entrypoint signature.
 *
 * @remarks
 * This abstract class provides a foundation for building account contracts in Aztec that use
 * the standard entrypoint interface. The default entrypoint accepts an AppPayload and a FeePayload,
 * which are the standard structures for transaction execution and fee payment in Aztec.
 *
 * Account contracts in Aztec implement account abstraction, allowing:
 * - Custom authentication mechanisms (ECDSA, Schnorr, multisig, etc.)
 * - Programmable transaction validation logic
 * - Flexible key management strategies
 * - Integration with hardware wallets and external signers
 *
 * To implement a custom account contract:
 * 1. Extend this class
 * 2. Implement {@link getAuthWitnessProvider} to provide your signing logic
 * 3. Implement {@link getInitializationFunctionAndArgs} to configure deployment
 * 4. Implement {@link getContractArtifact} to provide the compiled contract
 *
 * The class automatically provides the account interface through {@link getInterface},
 * which handles transaction creation and execution using the default entrypoint.
 *
 * @example
 * ```typescript
 * class CustomAccountContract extends DefaultAccountContract {
 *   constructor(private signingKey: Buffer) {
 *     super();
 *   }
 *
 *   getAuthWitnessProvider(address: CompleteAddress): AuthWitnessProvider {
 *     return new CustomAuthWitnessProvider(this.signingKey);
 *   }
 *
 *   async getInitializationFunctionAndArgs() {
 *     return {
 *       constructorName: 'constructor',
 *       constructorArgs: [computePublicKey(this.signingKey)]
 *     };
 *   }
 *
 *   async getContractArtifact() {
 *     return CustomAccountContractArtifact;
 *   }
 * }
 * ```
 *
 * @see {@link EcdsaKBaseAccountContract} for secp256k1 ECDSA implementation
 * @see {@link EcdsaRBaseAccountContract} for secp256r1 ECDSA implementation
 * @see {@link SchnorrBaseAccountContract} for Grumpkin Schnorr implementation
 * @see {@link DefaultAccountInterface} for the account interface implementation
 */
export abstract class DefaultAccountContract implements AccountContract {
  /**
   * Creates an authentication witness provider for the account.
   *
   * @param address - The complete address of the account including public keys
   * @returns An {@link AuthWitnessProvider} that can create authentication witnesses
   *
   * @remarks
   * The auth witness provider is responsible for generating cryptographic proofs that
   * authenticate transactions and authorization witnesses. Implementations must provide
   * a provider that matches the account contract's on-chain verification logic.
   */
  abstract getAuthWitnessProvider(address: CompleteAddress): AuthWitnessProvider;

  /**
   * Retrieves the initialization function and its arguments for deploying the account contract.
   *
   * @returns The constructor name and arguments, or undefined if no initialization is needed
   *
   * @remarks
   * This method defines how the account contract should be initialized when deployed.
   * The returned constructor name and arguments are used to call the initialization
   * function during contract deployment.
   *
   * Return undefined if the account contract requires no initialization (e.g., if it
   * derives all necessary information from the account's public keys).
   */
  abstract getInitializationFunctionAndArgs(): Promise<
    | {
        /** The name of the function used to initialize the contract */
        constructorName: string;
        /** The args to the function used to initialize the contract */
        constructorArgs: any[];
      }
    | undefined
  >;

  /**
   * Retrieves the compiled contract artifact.
   *
   * @returns A promise resolving to the contract artifact containing ABI and bytecode
   *
   * @remarks
   * The contract artifact contains all information needed to deploy and interact with
   * the account contract, including:
   * - Contract ABI (function signatures, events, etc.)
   * - Compiled circuit bytecode
   * - Contract metadata
   *
   * Implementations can either:
   * - Load the artifact eagerly (import and return synchronously)
   * - Load the artifact lazily (dynamic import for code splitting)
   */
  abstract getContractArtifact(): Promise<ContractArtifact>;

  constructor() {}

  /**
   * Creates an account interface for interacting with the account contract.
   *
   * @param address - The complete address of the account
   * @param chainInfo - Chain configuration including chain ID and version
   * @returns An {@link AccountInterface} for creating and executing transactions
   *
   * @remarks
   * The account interface provides methods for:
   * - Creating transaction execution requests
   * - Generating authentication witnesses
   * - Accessing account address and public keys
   *
   * This implementation uses {@link DefaultAccountInterface} which works with the
   * standard entrypoint signature (AppPayload + FeePayload).
   */
  getInterface(address: CompleteAddress, chainInfo: ChainInfo): AccountInterface {
    return new DefaultAccountInterface(this.getAuthWitnessProvider(address), address, chainInfo);
  }
}
