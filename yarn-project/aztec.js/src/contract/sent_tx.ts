import { FieldsOf } from '@aztec/circuits.js';
import { retryUntil } from '@aztec/foundation/retry';
import { AztecRPC, TxHash, TxReceipt, TxStatus } from '@aztec/types';

/** Options related to waiting for a tx. */
export type WaitOpts = {
  /** The maximum time (in seconds) to wait for the transaction to be mined. */
  timeout?: number;
  /** The time interval (in seconds) between retries to fetch the transaction receipt. */
  interval?: number;
};

const DefaultWaitOpts: WaitOpts = {
  timeout: 0,
  interval: 1,
};

/**
 * The SentTx class represents a sent transaction through the AztecRPCClient, providing methods to fetch
 * its hash, receipt, and mining status.
 */
export class SentTx {
  constructor(protected arc: AztecRPC, protected txHashPromise: Promise<TxHash>) {}

  /**
   * Retrieves the transaction hash of the SentTx instance.
   * The function internally awaits for the 'txHashPromise' to resolve, and then returns the resolved transaction hash.
   *
   * @returns A promise that resolves to the transaction hash of the SentTx instance.
   */
  public async getTxHash() {
    return await this.txHashPromise;
  }

  /**
   * Retrieve the transaction receipt associated with the current SentTx instance.
   * The function fetches the transaction hash using 'getTxHash' and then queries
   * the AztecRPCClient to get the corresponding transaction receipt.
   *
   * @returns A promise that resolves to a TxReceipt object representing the fetched transaction receipt.
   */
  public async getReceipt(): Promise<TxReceipt> {
    const txHash = await this.getTxHash();
    return await this.arc.getTxReceipt(txHash);
  }

  /**
   * Awaits for a tx to be mined and returns the receipt. Throws if tx is not mined.
   * @param opts - Options for configuring the waiting for the tx to be mined.
   * @returns The transaction receipt.
   */
  public async wait(opts?: WaitOpts): Promise<FieldsOf<TxReceipt>> {
    const receipt = await this.waitForReceipt(opts);
    if (receipt.status !== TxStatus.MINED)
      throw new Error(`Transaction ${await this.getTxHash()} was ${receipt.status}`);
    return receipt;
  }

  /**
   * Checks whether the transaction is mined or not within the specified timeout and retry interval.
   * Resolves to true if the transaction status is 'MINED', false otherwise.
   * Throws an error if the transaction receipt cannot be fetched after the given timeout.
   *
   * @param opts - Options for configuring the waiting for the tx to be mined.
   * @returns A Promise that resolves to a boolean indicating if the transaction is mined or not.
   */
  public async isMined(opts?: WaitOpts): Promise<boolean> {
    const receipt = await this.waitForReceipt(opts);
    return receipt.status === TxStatus.MINED;
  }

  protected async waitForReceipt(opts?: WaitOpts): Promise<TxReceipt> {
    const txHash = await this.getTxHash();
    return await retryUntil(
      async () => {
        const txReceipt = await this.arc.getTxReceipt(txHash);
        return txReceipt.status != TxStatus.PENDING ? txReceipt : undefined;
      },
      'isMined',
      opts?.timeout ?? DefaultWaitOpts.timeout,
      opts?.interval ?? DefaultWaitOpts.interval,
    );
  }
}
