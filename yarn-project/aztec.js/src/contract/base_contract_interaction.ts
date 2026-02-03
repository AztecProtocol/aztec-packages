import { createLogger } from '@aztec/foundation/log';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import type { Capsule, ExecutionPayload, TxReceipt } from '@aztec/stdlib/tx';

import type { Wallet } from '../wallet/wallet.js';
import {
  type InteractionWaitOptions,
  type RequestInteractionOptions,
  type SendInteractionOptions,
  type SendInteractionOptionsWithoutWait,
  type SendReturn,
  toSendOptions,
} from './interaction_options.js';

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
   * By default, waits for the transaction to be mined and returns the receipt (or custom type).
   * @param options - An object containing 'from' property representing
   * the AztecAddress of the sender, optional fee configuration, and optional wait settings
   * @returns TReturn (if wait is undefined/WaitOpts) or TxHash (if wait is NO_WAIT)
   */
  // Overload for when wait is not specified at all - returns TReturn
  public send<TReturn = TxReceipt>(options: SendInteractionOptionsWithoutWait): Promise<TReturn>;
  // Generic overload for explicit wait values
  // eslint-disable-next-line jsdoc/require-jsdoc
  public send<TReturn = TxReceipt, W extends InteractionWaitOptions = undefined>(
    options: SendInteractionOptions<W>,
  ): Promise<SendReturn<W, TReturn>>;
  // eslint-disable-next-line jsdoc/require-jsdoc
  public async send<TReturn = TxReceipt>(
    options: SendInteractionOptions<InteractionWaitOptions>,
  ): Promise<SendReturn<typeof options.wait, TReturn>> {
    // docs:end:send
    const executionPayload = await this.request(options);
    const sendOptions = toSendOptions(options);

    return (await this.wallet.sendTx(executionPayload, sendOptions as any)) as SendReturn<typeof options.wait, TReturn>;
  }
}
