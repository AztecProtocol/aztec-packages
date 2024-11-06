import { type AztecNode, type L2Block, MerkleTreeId } from '@aztec/circuit-types';
import { type Fr, INITIAL_L2_BLOCK_NUM, type PublicKey } from '@aztec/circuits.js';
import { type DebugLogger, createDebugLogger } from '@aztec/foundation/log';
import { type SerialQueue } from '@aztec/foundation/queue';
import { RunningPromise } from '@aztec/foundation/running-promise';

import { type IncomingNoteDao } from '../database/incoming_note_dao.js';
import { type PxeDatabase } from '../database/index.js';

/**
 * The Synchronizer class manages the synchronization of note processors and interacts with the Aztec node
 * to obtain encrypted logs, blocks, and other necessary information for the accounts.
 * It provides methods to start or stop the synchronization process, add new accounts, retrieve account
 * details, and fetch transactions by hash. The Synchronizer ensures that it maintains the note processors
 * in sync with the blockchain while handling retries and errors gracefully.
 */
export class Synchronizer {
  private runningPromise?: RunningPromise;
  private running = false;
  private initialSyncBlockNumber = INITIAL_L2_BLOCK_NUM - 1;
  private log: DebugLogger;

  constructor(private node: AztecNode, private db: PxeDatabase, private jobQueue: SerialQueue, logSuffix = '') {
    this.log = createDebugLogger(logSuffix ? `aztec:pxe_synchronizer_${logSuffix}` : 'aztec:pxe_synchronizer');
  }

  /**
   * Starts the synchronization process by fetching encrypted logs and blocks from a specified position.
   * Continuously processes the fetched data for all note processors until stopped. If there is no data
   * available, it retries after a specified interval.
   *
   * @param limit - The maximum number of encrypted, unencrypted logs and blocks to fetch in each iteration.
   * @param retryInterval - The time interval (in ms) to wait before retrying if no data is available.
   */
  public async start(limit = 1, retryInterval = 1000) {
    if (this.running) {
      return;
    }
    this.running = true;

    await this.jobQueue.put(() => this.initialSync());
    this.log.info('Initial sync complete');
    this.runningPromise = new RunningPromise(() => this.sync(limit), retryInterval);
    this.runningPromise.start();
    this.log.debug('Started loop');
  }

  protected async initialSync() {
    // fast forward to the latest block
    const latestHeader = await this.node.getHeader();
    this.initialSyncBlockNumber = Number(latestHeader.globalVariables.blockNumber.toBigInt());
    await this.db.setHeader(latestHeader);
  }

  /**
   * Fetches encrypted logs and blocks from the Aztec node and processes them for all note processors.
   * If needed, catches up note processors that are lagging behind the main sync, e.g. because we just added a new account.
   *
   * Uses the job queue to ensure that
   * - sync does not overlap with pxe simulations.
   * - one sync is running at a time.
   *
   * @param limit - The maximum number of encrypted, unencrypted logs and blocks to fetch in each iteration.
   * @returns a promise that resolves when the sync is complete
   */
  protected sync(limit: number) {
    return this.jobQueue.put(async () => {
      let moreWork = true;
      // keep external this.running flag to interrupt greedy sync
      while (moreWork && this.running) {
        moreWork = await this.work(limit);
      }
    });
  }

  /**
   * Fetches encrypted logs and blocks from the Aztec node and processes them for all note processors.
   *
   * @param limit - The maximum number of encrypted, unencrypted logs and blocks to fetch in each iteration.
   * @returns true if there could be more work, false if we're caught up or there was an error.
   */
  protected async work(limit = 1): Promise<boolean> {
    const from = this.getSynchedBlockNumber() + 1;
    try {
      const blocks = await this.node.getBlocks(from, limit);
      if (blocks.length === 0) {
        return false;
      }

      // Update latest tree roots from the most recent block
      const latestBlock = blocks[blocks.length - 1];
      await this.setHeaderFromBlock(latestBlock);
      return true;
    } catch (err) {
      this.log.error(`Error in synchronizer work`, err);
      return false;
    }
  }

  private async setHeaderFromBlock(latestBlock: L2Block) {
    if (latestBlock.number < this.initialSyncBlockNumber) {
      return;
    }

    await this.db.setHeader(latestBlock.header);
  }

  /**
   * Stops the synchronizer gracefully, interrupting any ongoing sleep and waiting for the current
   * iteration to complete before setting the running state to false. Once stopped, the synchronizer
   * will no longer process blocks or encrypted logs and must be restarted using the start method.
   *
   * @returns A promise that resolves when the synchronizer has successfully stopped.
   */
  public async stop() {
    this.running = false;
    await this.runningPromise?.stop();
    this.log.info('Stopped');
  }

  private getSynchedBlockNumber() {
    return this.db.getBlockNumber() ?? this.initialSyncBlockNumber;
  }

  /**
   * Checks whether all the blocks were processed (tree roots updated, txs updated with block info, etc.).
   * @returns True if there are no outstanding blocks to be synched.
   * @remarks This indicates that blocks and transactions are synched even if notes are not.
   * @remarks Compares local block number with the block number from aztec node.
   */
  public async isGlobalStateSynchronized() {
    const latest = await this.node.getBlockNumber();
    return latest <= this.getSynchedBlockNumber();
  }

  /**
   * Returns the latest block that has been synchronized by the synchronizer and each account.
   * @returns The latest block synchronized for blocks, and the latest block synched for notes for each public key being tracked.
   */
  public getSyncStatus() {
    const lastBlockNumber = this.getSynchedBlockNumber();
    return {
      blocks: lastBlockNumber,
    };
  }

  async #removeNullifiedNotes(notes: IncomingNoteDao[]) {
    // now group the decoded incoming notes by public key
    const addressPointToIncomingNotes: Map<PublicKey, IncomingNoteDao[]> = new Map();
    for (const noteDao of notes) {
      const notesForAddressPoint = addressPointToIncomingNotes.get(noteDao.addressPoint) ?? [];
      notesForAddressPoint.push(noteDao);
      addressPointToIncomingNotes.set(noteDao.addressPoint, notesForAddressPoint);
    }

    // now for each group, look for the nullifiers in the nullifier tree
    for (const [publicKey, notes] of addressPointToIncomingNotes.entries()) {
      const nullifiers = notes.map(n => n.siloedNullifier);
      const relevantNullifiers: Fr[] = [];
      for (const nullifier of nullifiers) {
        // NOTE: this leaks information about the nullifiers I'm interested in to the node.
        const found = await this.node.findLeafIndex('latest', MerkleTreeId.NULLIFIER_TREE, nullifier);
        if (found) {
          relevantNullifiers.push(nullifier);
        }
      }
      await this.db.removeNullifiedNotes(relevantNullifiers, publicKey);
    }
  }
}
