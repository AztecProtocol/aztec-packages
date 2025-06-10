import { promiseWithResolvers } from '@aztec/foundation/promise';
import { retryUntil } from '@aztec/foundation/retry';
import type { FieldsOf } from '@aztec/foundation/types';
import type { AztecNode, PXE } from '@aztec/stdlib/interfaces/client';
import { TxHash, type TxReceipt, TxStatus } from '@aztec/stdlib/tx';

import type { Wallet } from '../wallet/wallet.js';

/** Options related to waiting for a tx. */
export type WaitOpts = {
  /** The amount of time to ignore TxStatus.DROPPED receipts (in seconds) due to the presumption that it is being propagated by the p2p network. Defaults to 5. */
  ignoreDroppedReceiptsFor?: number;
  /** The maximum time (in seconds) to wait for the transaction to be mined. Defaults to 60. */
  timeout?: number;
  /** The time interval (in seconds) between retries to fetch the transaction receipt. Defaults to 1. */
  interval?: number;
  /** Whether to accept a revert as a status code for the tx when waiting for it. If false, will throw if the tx reverts. */
  dontThrowOnRevert?: boolean;
};

export const DefaultWaitOpts: WaitOpts = {
  ignoreDroppedReceiptsFor: 5,
  timeout: 60,
  interval: 1,
};

/**
 * The SentTx class represents a sent transaction through the PXE (or directly to a node) providing methods to fetch
 * its hash, receipt, and mining status.
 */
export class SentTx {
  protected sendTxPromise: Promise<void>;
  protected sendTxError?: Error;
  protected txHash?: TxHash;

  constructor(
    protected pxeWalletOrNode: Wallet | AztecNode | PXE,
    sendTx: () => Promise<TxHash>,
  ) {
    const { promise, resolve } = promiseWithResolvers<void>();
    this.sendTxPromise = promise;
    sendTx()
      .then(txHash => {
        this.txHash = txHash;
        resolve();
      })
      .catch(err => {
        this.sendTxError = err;
        // Calling resolve instead of reject here because we want to throw the error when getTxHash is called.
        resolve();
      });
  }

  /**
   * Retrieves the transaction hash of the SentTx instance.
   * The function internally awaits for the 'txHashPromise' to resolve, and then returns the resolved transaction hash.
   *
   * @returns A promise that resolves to the transaction hash of the SentTx instance.
   * TODO(#7717): Don't throw here.
   */
  public async getTxHash(): Promise<TxHash> {
    // Make sure sendTx has been resolved, which can be triggered when it returns a txHash or when it throws an error.
    await this.sendTxPromise;

    // If sendTx threw an error, throw it.
    if (this.sendTxError) {
      throw this.sendTxError;
    }

    // sendTx returned a txHash if it's been resolved and no error was set.
    return Promise.resolve(this.txHash!);
  }

  /**
   * Retrieve the transaction receipt associated with the current SentTx instance.
   * The function fetches the transaction hash using 'getTxHash' and then queries
   * the PXE to get the corresponding transaction receipt.
   *
   * @returns A promise that resolves to a TxReceipt object representing the fetched transaction receipt.
   */
  public async getReceipt(): Promise<TxReceipt> {
    const txHash = await this.getTxHash();
    return await this.pxeWalletOrNode.getTxReceipt(txHash);
  }

  /**
   * Awaits for a tx to be mined and returns the receipt. Throws if tx is not mined.
   * @param opts - Options for configuring the waiting for the tx to be mined.
   * @returns The transaction receipt.
   */
  public async wait(opts?: WaitOpts): Promise<FieldsOf<TxReceipt>> {
    const receipt = await this.waitForReceipt(opts);
    if (receipt.status !== TxStatus.SUCCESS && !opts?.dontThrowOnRevert) {
      throw new Error(
        `Transaction ${await this.getTxHash()} was ${receipt.status}. Reason: ${receipt.error ?? 'unknown'}`,
      );
    }
    return receipt;
  }

  protected async waitForReceipt(opts?: WaitOpts): Promise<TxReceipt> {
    const txHash = await this.getTxHash();
    const startTime = Date.now();
    const ignoreDroppedReceiptsFor = opts?.ignoreDroppedReceiptsFor ?? DefaultWaitOpts.ignoreDroppedReceiptsFor;

    return await retryUntil(
      async () => {
        const txReceipt = await this.pxeWalletOrNode.getTxReceipt(txHash);
        // If receipt is not yet available, try again
        if (txReceipt.status === TxStatus.PENDING) {
          return undefined;
        }
        // If the tx was "dropped", either return it or ignore based on timing.
        // We can ignore it at first because the transaction may have been sent to node 1, and now we're asking node 2 for the receipt.
        // If we don't allow a short grace period, we could incorrectly return a TxReceipt with status DROPPED.
        if (txReceipt.status === TxStatus.DROPPED) {
          const elapsedSeconds = (Date.now() - startTime) / 1000;
          if (!ignoreDroppedReceiptsFor || elapsedSeconds > ignoreDroppedReceiptsFor) {
            return txReceipt;
          }
          return undefined;
        }
        return txReceipt;
      },
      'isMined',
      opts?.timeout ?? DefaultWaitOpts.timeout,
      opts?.interval ?? DefaultWaitOpts.interval,
    );
  }
}
