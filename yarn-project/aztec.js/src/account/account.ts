import type { DefaultAccountEntrypointOptions } from '@aztec/entrypoints/account';
import type { ExecutionPayload } from '@aztec/entrypoints/payload';
import { Fr } from '@aztec/foundation/fields';
import { AuthWitness } from '@aztec/stdlib/auth-witness';
import type { GasSettings } from '@aztec/stdlib/gas';
import type { TxExecutionRequest } from '@aztec/stdlib/tx';

import { type CallIntent, type IntentInnerHash, computeAuthWitMessageHash } from '../utils/authwit.js';
import type { AccountInterface } from './interface.js';

/**
 * An authwit provider that can create both private and public authwits
 * with an intent as input, as opposed to just a precomputed inner hash
 */
interface AuthwitnessIntentProvider {
  /**
   * Creates a private authwit from an intent or inner hash, to be provided
   * during function execution
   * @param intent - The action (or inner hash) to authorize
   */
  createAuthWit(intent: IntentInnerHash | CallIntent | Buffer | Fr): Promise<AuthWitness>;
}

/**
 * Complete account type combining account interface capabilities with intent-based authorization.
 *
 * @remarks
 * The Account type extends AccountInterface with the ability to create authorization witnesses
 * from high-level intents (function calls) rather than just pre-computed message hashes.
 * This provides a more developer-friendly API for creating cross-contract authorizations.
 *
 * @example
 * ```typescript
 * // Create authwit from function call intent
 * const authwit = await account.createAuthWit({
 *   caller: dappContract.address,
 *   call: {
 *     to: tokenContract.address,
 *     selector: transferSelector,
 *     args: [recipient, amount]
 *   }
 * });
 * ```
 */
export type Account = AccountInterface & AuthwitnessIntentProvider;

/**
 * Base implementation of the Account interface providing authorization witness creation.
 *
 * @remarks
 * BaseAccount wraps an AccountInterface and adds convenient methods for creating
 * authorization witnesses from intents (function calls) in addition to raw message hashes.
 * It handles the message hash computation including chain ID and version for replay protection.
 *
 * This class is typically used as a building block for higher-level account implementations
 * that add additional functionality like wallet integration or transaction batching.
 *
 * @example
 * ```typescript
 * const accountInterface = new SchnorrAccountInterface(completeAddress, signingKey);
 * const account = new BaseAccount(accountInterface);
 *
 * // Create authwit from message hash
 * const authwit1 = await account.createAuthWit(messageHash);
 *
 * // Create authwit from function call intent
 * const authwit2 = await account.createAuthWit({
 *   caller: callerAddress,
 *   call: functionCall
 * });
 *
 * // Create transaction
 * const txRequest = await account.createTxExecutionRequest(
 *   executionPayload,
 *   gasSettings
 * );
 * ```
 */
export class BaseAccount implements Account {
  constructor(protected account: AccountInterface) {}

  createTxExecutionRequest(
    exec: ExecutionPayload,
    gasSettings: GasSettings,
    options: DefaultAccountEntrypointOptions,
  ): Promise<TxExecutionRequest> {
    return this.account.createTxExecutionRequest(exec, gasSettings, options);
  }

  getChainId(): Fr {
    return this.account.getChainId();
  }

  getVersion(): Fr {
    return this.account.getVersion();
  }

  /** Returns the complete address of the account that implements this wallet. */
  public getCompleteAddress() {
    return this.account.getCompleteAddress();
  }

  /** Returns the address of the account that implements this wallet. */
  public getAddress() {
    return this.getCompleteAddress().address;
  }

  /**
   * Computes an authentication witness from either a message hash or an intent.
   *
   * If a message hash is provided, it will create a witness for the hash directly.
   * Otherwise, it will compute the message hash using the intent, along with the
   * chain id and the version values provided by the wallet.
   *
   * @param messageHashOrIntent - The message hash of the intent to approve
   * @returns The authentication witness
   */
  async createAuthWit(messageHashOrIntent: Fr | Buffer | CallIntent | IntentInnerHash): Promise<AuthWitness> {
    let messageHash: Fr;
    if (Buffer.isBuffer(messageHashOrIntent)) {
      messageHash = Fr.fromBuffer(messageHashOrIntent);
    } else if (messageHashOrIntent instanceof Fr) {
      messageHash = messageHashOrIntent;
    } else {
      messageHash = await this.getMessageHash(messageHashOrIntent);
    }

    return this.account.createAuthWit(messageHash);
  }

  /**
   * Returns the message hash for the given intent
   *
   * @param intent - A tuple of (consumer and inner hash) or (caller and action)
   * @returns The message hash
   */
  private getMessageHash(intent: IntentInnerHash | CallIntent): Promise<Fr> {
    const chainId = this.getChainId();
    const version = this.getVersion();
    return computeAuthWitMessageHash(intent, { chainId, version });
  }
}
