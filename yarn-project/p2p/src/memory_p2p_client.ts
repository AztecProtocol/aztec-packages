import { InterruptableSleep, RollupBlockDownloader } from '@aztec/world-state';
import { RollupSource } from '@aztec/archiver';

import { InMemoryTxPool } from './tx_pool/memory_tx_pool.js';
import { P2P } from './p2p_client.js';
import { TxPool } from './tx_pool/index.js';
import { Tx, Rollup } from './temp_types.js';

const TAKE_NUM = 10;

/**
 * Enum defining the possible states of the p2p client.
 */
enum P2PClientState {
  IDLE,
  SYNCING,
  RUNNING,
  STOPPED,
}

/**
 * An in-memory implementation of the P2P client.
 */
export class InMemoryP2PCLient implements P2P {
  /**
   * L2 Block download that p2p client uses to stay in sync with latest blocks.
   */
  private blockDownloader: RollupBlockDownloader;

  /**
   * Property that indicates whether the client is running.
   */
  private running = false;

  /**
   * Property that indicates whether the client is ready to receive new txs.
   */
  private ready = false;

  /**
   * The JS promise that will be running to keep the client's data in sync. Can be interrupted if the client is stopped.
   */
  private runningSyncPromise!: Promise<void>;

  /**
   * A function that waits for a specified time or until it's interrupted.
   */
  private interruptableSleep = new InterruptableSleep();

  /**
   * Store the ID of the latest rollup the client has synced to.
   */
  private syncedRollupId = 0;

  /**
   * In-memory P2P client constructor.
   * @param rollupSource - P2P client's source for fetching existing rollup data.
   * @param txPool - The client's instance of a transaction pool. Defaults to in-memory implementation.
   */
  constructor(private rollupSource: RollupSource, private txPool: TxPool = new InMemoryTxPool()) {
    this.blockDownloader = new RollupBlockDownloader(rollupSource, TAKE_NUM);
  }

  /**
   * Starts the P2P client.
   */
  public async start() {
    this.running = true;

    let synced = false;

    const lastRollupId = await this.rollupSource.getLatestRollupId();

    const txPoolSize = this.txPool.getAllTxs().keys.length;
    if (!txPoolSize) {
      // No initial reconciliation needed, proceed;
      synced = true;
      this.syncedRollupId = lastRollupId;
      // start block downloader from latest L2 Block ID
      this.blockDownloader.start(lastRollupId);
    }

    while (!synced) {
      // start block downloader from the beginning
      this.blockDownloader.start();
      const rollups = await this.blockDownloader.getBlocks();
      this.reconcileTxPool(rollups);

      if (rollups.length) {
        this.syncedRollupId = rollups[rollups.length - 1].rollupId;
      } else {
        synced = true;
        this.syncedRollupId = lastRollupId;
      }
    }
    this.ready = true;

    const runningSyncPromise = async () => {
      while (this.running) {
        const newRollups = await this.blockDownloader.getBlocks();
        if (newRollups.length) {
          this.reconcileTxPool(newRollups);
        } else {
          await this.interruptableSleep.sleep(10000);
        }
      }
    };

    this.runningSyncPromise = runningSyncPromise();
  }

  /**
   * Allows consumers to stop the instance of the P2P client.
   * 'running' & 'ready' will now return 'false' and the running promise that keeps the client synced is interrupted.
   */
  public async stop() {
    this.running = false;
    this.ready = false;
    this.blockDownloader.stop();
    this.interruptableSleep.interrupt();
    await this.runningSyncPromise;
  }

  /**
   * Returns all transactions in the transaction pool.
   * @returns An array of Txs.
   */
  public getTxs(): Tx[] {
    return this.txPool.getAllTxs();
  }

  /**
   * Verifies the 'tx' and, if valid, adds it to local tx pool and forwards it to other peers.
   * @param tx - The tx to verify.
   **/
  public sendTx(tx: Tx): void {
    if (!this.ready || !this.running) {
      return;
    }
    this.txPool.addTxs([tx]);
  }

  /**
   * Public function to check if P2P client is currently running.
   * @returns True if the P2P client is running.
   */
  public isRunning() {
    return this.running;
  }

  /**
   * Public function to check if the p2p client is fully synced and ready to receive txs.
   * @returns True if the P2P client is ready to receive txs.
   */
  public isReady() {
    return this.ready;
  }

  /**
   * Public function to check the latest rollup ID that the P2P client is synced to.
   * @returns Rollup ID of latest L2 Block we've synced with.
   */
  public getSyncedRollupId() {
    return this.syncedRollupId;
  }

  /**
   * Method to check the status the p2p client.
   * @returns Information about p2p client status: ready, syncing, syncedRollupId.
   */
  public getStatus() {
    let clientState = P2PClientState.IDLE;
    if (this.ready) {
      clientState = P2PClientState.RUNNING;
    } else if (this.running) {
      clientState = P2PClientState.SYNCING;
    }

    return {
      state: clientState,
      syncedToRollup: this.syncedRollupId,
    };
  }

  /**
   * Internal method that uses the provided rollups to check against the client's tx pool.
   * @param rollups - A list of existing rollups with txs that the P2P client needs to ensure the tx pool is reconciled with.
   */
  private reconcileTxPool(rollups: Rollup[]) {
    for (let i = 0; i < rollups.length; i++) {
      const { txs } = rollups[i];
      this.txPool.deleteTxs(txs?.map(({ txId }) => txId) || []);
    }
  }
}
