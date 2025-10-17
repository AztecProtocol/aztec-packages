import type { AuthWitnessProvider, EntrypointInterface } from '@aztec/entrypoints/interfaces';
import type { Fr } from '@aztec/foundation/fields';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { CompleteAddress } from '@aztec/stdlib/contract';

// docs:start:account-interface

/**
 * Core interface for account abstraction in Aztec, handling transaction creation and authorization.
 *
 * @remarks
 * AccountInterface defines the contract between account implementations and the wallet layer.
 * It enables account abstraction by allowing custom logic for:
 * - **Transaction Creation**: Converting function calls into authenticated transaction execution requests
 * - **Authorization**: Creating cryptographic proofs (witnesses) for cross-contract authorization
 * - **Fee Payment**: Customizing how transaction fees are handled
 *
 * Account contracts in Aztec are fully programmable, allowing implementations to define custom:
 * - Authentication mechanisms (signatures, multi-sig, social recovery, etc.)
 * - Transaction validation rules
 * - Fee payment strategies
 * - Nonce management
 *
 * The interface combines two key capabilities:
 * - EntrypointInterface: Creates transaction execution requests with account-specific logic
 * - AuthWitnessProvider: Creates authorization witnesses for inter-contract calls
 *
 * @example
 * ```typescript
 * class SchnorrAccountInterface implements AccountInterface {
 *   constructor(
 *     private completeAddress: CompleteAddress,
 *     private signingKey: GrumpkinPrivateKey
 *   ) {}
 *
 *   async createTxExecutionRequest(
 *     exec: ExecutionPayload,
 *     gasSettings: GasSettings
 *   ): Promise<TxExecutionRequest> {
 *     // Create transaction with Schnorr signature
 *     const message = computeTxMessage(exec, gasSettings);
 *     const signature = schnorrSign(message, this.signingKey);
 *     return { exec, gasSettings, signature };
 *   }
 *
 *   async createAuthWit(messageHash: Fr): Promise<AuthWitness> {
 *     // Sign authorization message
 *     const signature = schnorrSign(messageHash, this.signingKey);
 *     return AuthWitness.fromSignature(signature);
 *   }
 *
 *   getCompleteAddress() { return this.completeAddress; }
 *   getAddress() { return this.completeAddress.address; }
 *   getChainId() { return Fr.ZERO; }
 *   getVersion() { return Fr.ZERO; }
 * }
 * ```
 */
export interface AccountInterface extends EntrypointInterface, AuthWitnessProvider {
  /** Returns the complete address for this account. */
  getCompleteAddress(): CompleteAddress;

  /** Returns the address for this account. */
  getAddress(): AztecAddress;

  /** Returns the chain id for this account */
  getChainId(): Fr;

  /** Returns the rollup version for this account */
  getVersion(): Fr;
}
// docs:end:account-interface
