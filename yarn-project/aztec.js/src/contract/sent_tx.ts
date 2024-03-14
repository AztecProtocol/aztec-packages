import { ExtendedNote, GetUnencryptedLogsResponse, PXE, TxHash, TxReceipt, TxStatus } from '@aztec/circuit-types';
import { retryUntil } from '@aztec/foundation/retry';
import { FieldsOf } from '@aztec/foundation/types';

/** Options related to waiting for a tx. */
export type WaitOpts = {
  /** The maximum time (in seconds) to wait for the transaction to be mined. Defaults to 60. */
  timeout?: number;
  /** The time interval (in seconds) between retries to fetch the transaction receipt. Defaults to 1. */
  interval?: number;
  /**
   * Whether to wait for the PXE Service to sync all notes up to the block in which this tx was mined.
   * If false, then any queries that depend on state set by this transaction may return stale data. Defaults to true.
   **/
  waitForNotesSync?: boolean;
  /** Whether to include information useful for debugging/testing in the receipt. */
  debug?: boolean;
};

export const DefaultWaitOpts: WaitOpts = {
  timeout: 60,
  interval: 1,
  waitForNotesSync: true,
  debug: false,
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
    if (opts?.debug && opts.waitForNotesSync === false) {
      throw new Error('Cannot set getNotes to true if waitForNotesSync is false');
    }
    const receipt = await this.waitForReceipt(opts);
    if (receipt.status !== TxStatus.MINED) {
      throw new Error(
        `Transaction ${await this.getTxHash()} was ${receipt.status}. Reason: ${receipt.error ?? 'unknown'}`,
      );
    }
    if (opts?.debug) {
      const txHash = await this.getTxHash();
      const tx = (await this.pxe.getTxEffect(txHash))!;
      const visibleNotes = await this.pxe.getNotes({ txHash });
      receipt.debugInfo = {
        noteHashes: tx.noteHashes.filter(n => !n.isZero()),
        nullifiers: tx.nullifiers.filter(n => !n.isZero()),
        publicDataWrites: tx.publicDataWrites.filter(p => !p.isEmpty()),
        l2ToL1Msgs: tx.l2ToL1Msgs.filter(l => !l.isZero()),
        visibleNotes,
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

  /**
   * Get notes of accounts registered in the provided PXE/Wallet created in this tx.
   * @remarks This function will wait for the tx to be mined if it hasn't been already.
   * @returns The requested notes.
   */
  public async getVisibleNotes(): Promise<ExtendedNote[]> {
    await this.wait();
    return this.pxe.getNotes({ txHash: await this.getTxHash() });
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
        const waitForNotesSync = opts?.waitForNotesSync ?? DefaultWaitOpts.waitForNotesSync;
        if (!waitForNotesSync) {
          return txReceipt;
        }
        // Check if all sync blocks on the PXE Service are greater or equal than the block in which the tx was mined
        const { blocks, notes } = await this.pxe.getSyncStatus();
        const targetBlock = txReceipt.blockNumber!;
        const areNotesSynced = blocks >= targetBlock && Object.values(notes).every(block => block >= targetBlock);
        return areNotesSynced ? txReceipt : undefined;
      },
      'isMined',
      opts?.timeout ?? DefaultWaitOpts.timeout,
      opts?.interval ?? DefaultWaitOpts.interval,
    );
  }
}
