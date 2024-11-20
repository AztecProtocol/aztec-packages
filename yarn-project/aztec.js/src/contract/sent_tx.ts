import { type GetUnencryptedLogsResponse, type PXE, type TxHash, type TxReceipt, TxStatus } from '@aztec/circuit-types';
import { retryUntil } from '@aztec/foundation/retry';
import { type FieldsOf } from '@aztec/foundation/types';

/** Options related to waiting for a tx. */
export type WaitOpts = {
  /** The maximum time (in seconds) to wait for the transaction to be mined. Defaults to 60. */
  timeout?: number;
  /** The maximum time (in seconds) to wait for the transaction to be proven. Defaults to 600. */
  provenTimeout?: number;
  /** The time interval (in seconds) between retries to fetch the transaction receipt. Defaults to 1. */
  interval?: number;
  /** Whether to wait for the tx to be proven. */
  proven?: boolean;
  /**
   * Whether to wait for the node to notify that the block in which this tx was mined is available to fetch notes from.
   * If false, then any queries that depend on state set by this transaction may return stale data. Defaults to true.
   **/
  waitForNotesAvailable?: boolean;
  /** Whether to include information useful for debugging/testing in the receipt. */
  debug?: boolean;
  /** Whether to accept a revert as a status code for the tx when waiting for it. If false, will throw if the tx reverts. */
  dontThrowOnRevert?: boolean;
};

export const DefaultWaitOpts: WaitOpts = {
  timeout: 60,
  provenTimeout: 600,
  interval: 1,
  debug: false,
  waitForNotesAvailable: true,
};

/**
 * The SentTx class represents a sent transaction through the PXE, providing methods to fetch
 * its hash, receipt, and mining status.
 */
export class SentTx {
  constructor(protected pxe: PXE, protected txHashPromise: Promise<TxHash>) {}

  /**
   * Retrieves the transaction hash of the SentTx instance.
   * The function internally awaits for the 'txHashPromise' to resolve, and then returns the resolved transaction hash.
   *
   * @returns A promise that resolves to the transaction hash of the SentTx instance.
   * TODO(#7717): Don't throw here.
   */
  public getTxHash(): Promise<TxHash> {
    return this.txHashPromise;
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
    return await this.pxe.getTxReceipt(txHash);
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
    if (opts?.proven && receipt.blockNumber !== undefined) {
      await this.waitForProven(receipt.blockNumber, opts);
    }
    if (opts?.debug) {
      const txHash = await this.getTxHash();
      const { data: tx } = (await this.pxe.getTxEffect(txHash))!;
      receipt.debugInfo = {
        noteHashes: tx.noteHashes,
        nullifiers: tx.nullifiers,
        publicDataWrites: tx.publicDataWrites,
        l2ToL1Msgs: tx.l2ToL1Msgs,
      };
    }
    return receipt;
  }

  /**
   * Gets unencrypted logs emitted by this tx.
   * @remarks This function will wait for the tx to be mined if it hasn't been already.
   * @returns The requested logs.
   */
  public async getUnencryptedLogs(): Promise<GetUnencryptedLogsResponse> {
    await this.wait();
    return this.pxe.getUnencryptedLogs({ txHash: await this.getTxHash() });
  }

  protected async waitForReceipt(opts?: WaitOpts): Promise<TxReceipt> {
    const txHash = await this.getTxHash();
    return await retryUntil(
      async () => {
        const txReceipt = await this.pxe.getTxReceipt(txHash);
        // If receipt is not yet available, try again
        if (txReceipt.status === TxStatus.PENDING) {
          return undefined;
        }
        // If the tx was dropped, return it
        if (txReceipt.status === TxStatus.DROPPED) {
          return txReceipt;
        }
        // If we don't care about waiting for notes to be synced, return the receipt
        const waitForNotesAvailable = opts?.waitForNotesAvailable ?? DefaultWaitOpts.waitForNotesAvailable;
        if (!waitForNotesAvailable) {
          return txReceipt;
        }
        // Check if all sync blocks on the PXE Service are greater or equal than the block in which the tx was mined
        const { blocks } = await this.pxe.getSyncStatus();
        const targetBlock = txReceipt.blockNumber!;
        const areNotesAvailable = blocks >= targetBlock;
        return areNotesAvailable ? txReceipt : undefined;
      },
      'isMined',
      opts?.timeout ?? DefaultWaitOpts.timeout,
      opts?.interval ?? DefaultWaitOpts.interval,
    );
  }

  protected async waitForProven(minedBlock: number, opts?: WaitOpts) {
    return await retryUntil(
      async () => {
        const provenBlock = await this.pxe.getProvenBlockNumber();
        return provenBlock >= minedBlock ? provenBlock : undefined;
      },
      'isProven',
      opts?.provenTimeout ?? DefaultWaitOpts.provenTimeout,
      opts?.interval ?? DefaultWaitOpts.interval,
    );
  }
}
