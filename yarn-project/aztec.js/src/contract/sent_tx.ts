import { retryUntil } from '@aztec/foundation/retry';
import { AztecRPC, TxHash, TxReceipt, TxStatus } from '@aztec/types';

/**
 * The SentTx class represents a sent transaction through the AztecRPCClient, providing methods to fetch
 * its hash, receipt, and mining status.
 */
export class SentTx {
  constructor(private arc: AztecRPC, private txHashPromise: Promise<TxHash>) {}

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
   * Checks whether the transaction is mined or not within the specified timeout and retry interval.
   * Resolves to true if the transaction status is 'MINED', false otherwise.
   * Throws an error if the transaction receipt cannot be fetched after the given timeout.
   *
   * @param timeout - The maximum time (in seconds) to wait for the transaction to be mined. A value of 0 means no timeout.
   * @param interval - The time interval (in seconds) between retries to fetch the transaction receipt.
   * @returns A Promise that resolves to a boolean indicating if the transaction is mined or not.
   */
  public async isMined(timeout = 0, interval = 1): Promise<boolean> {
    const txHash = await this.getTxHash();
    const receipt = await retryUntil(
      async () => {
        const txReceipt = await this.arc.getTxReceipt(txHash);
        return txReceipt.status != TxStatus.PENDING ? txReceipt : undefined;
      },
      'isMined',
      timeout,
      interval,
    );
    return receipt.status === TxStatus.MINED;
  }
}
