import type { ExecutionPayload } from '@aztec/entrypoints/payload';
import { createLogger } from '@aztec/foundation/log';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import type { Capsule } from '@aztec/stdlib/tx';

import type { Wallet } from '../wallet/wallet.js';
import { type RequestInteractionOptions, type SendInteractionOptions, toSendOptions } from './interaction_options.js';
import { SentTx } from './sent_tx.js';

/**
 * Base class for an interaction with a contract, be it a deployment, a function call, or a batch.
 * Implements the sequence create/simulate/send.
 */
export abstract class BaseContractInteraction {
  protected log = createLogger('aztecjs:contract_interaction');

  constructor(
    protected wallet: Wallet,
    protected authWitnesses: AuthWitness[] = [],
    protected capsules: Capsule[] = [],
  ) {}

  /**
   * Returns an execution request that represents this operation.
   * Can be used as a building block for constructing batch requests.
   * @param options - An optional object containing additional configuration for the transaction.
   * @returns An execution request wrapped in promise.
   */
  public abstract request(options?: RequestInteractionOptions): Promise<ExecutionPayload>;

  // docs:start:send
  /**
   * Sends a transaction to the contract function with the specified options.
   * This function throws an error if called on a utility function.
   * It creates and signs the transaction if necessary, and returns a SentTx instance,
   * which can be used to track the transaction status, receipt, and events.
   * @param options - An object containing 'from' property representing
   * the AztecAddress of the sender and optional fee configuration
   * @returns A SentTx instance for tracking the transaction status and information.
   */
  public send(options: SendInteractionOptions): SentTx {
    // docs:end:send
    const sendTx = async () => {
      const executionPayload = await this.request(options);
      const sendOptions = await toSendOptions(options);
      return this.wallet.sendTx(executionPayload, sendOptions);
    };
    return new SentTx(this.wallet, sendTx);
  }
}
