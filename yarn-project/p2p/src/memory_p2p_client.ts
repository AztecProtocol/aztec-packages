import { InMemoryTxPool } from './memory_tx_pool.js';
import { P2P } from './p2p_client.js';
import { Tx } from './tx.js';
import { TxPool } from './tx_pool.js';
import { Rollup, RollupSource } from './types.js';

const TAKE_NUM = 10;

/**
 * An in-memory implementation of the P2P client.
 */
export class MemoryP2PCLient implements P2P {
  /**
   * Property that indicates whether the client is running.
   */
  private running = false;

  /**
   * Property that indicates whether the client is currently syncing with a block source.
   */
  private syncing = false;

  /**
   * Property that indicates whether the client is ready to receive new txs.
   */
  private ready = false;

  /**
   * The JS promise that will be running to keep the client's data in sync. Can be interrupted if the client is stopped.
   */
  private runningSyncPromise!: Promise<void>;

  /**
   * The client's instance of a transaction pool.
   */
  private txPool: TxPool;

  /**
   * Store the ID of the latest rollup the client has synced to.
   */
  private syncedRollupId = 0;

  /**
   * In-memory P2P client constructor.
   * @param rollupSource - P2P client's source for fetching existing rollup data.
   */
  constructor(private rollupSource: RollupSource) {
    this.txPool = new InMemoryTxPool();
  }

  /**
   * Starts the P2P client.
   */
  public start() {
    this.running = true;

    const lastRollupId = this.rollupSource.getLastRollupId();

    let synced = false;
    let index = 0;
    while (!synced) {
      const rollups = this.rollupSource.getRollups(index, TAKE_NUM);
      this.reconcileTxPool(rollups);
      index += TAKE_NUM;
      this.syncedRollupId = index;

      if (index >= lastRollupId) {
        synced = true;
        this.syncedRollupId = lastRollupId;
      }
    }
    this.syncing = false;
    this.ready = true;

    // TODO start running sync promise that checks for new blocks
    // and performs more reconciliation with our tx pool when they're published
  }

  /**
   * Allows consumers to stop the instance of the P2P client.
   * 'running' & 'ready' will now return 'false' and the running promise that keeps the client synced is interrupted.
   */
  public stop() {
    this.running = false;
    this.ready = false;
    // TODO: interrupt runningSyncPromise
  }

  /**
   * Returns all transactions in the transaction pool.
   * @returns An array of Txs.
   */
  public getTxs(): Tx[] {
    return [];
  }

  /**
   * Verifies the 'tx' and, if valid, adds it to local tx pool and forwards it to other peers.
   * @param tx - The tx to verify.
   **/
  public sendTx(tx: Tx): void {
    console.log(JSON.stringify(tx));
    return;
  }

  /**
   * Public function to check if P2P client is currently running.
   * @returns True if the P2P client is running.
   */
  public isRunning() {
    return this.running;
  }

  /**
   * Lets consumers know if the p2p client is fully synced and ready to receive txs.
   * @returns True if the P2P client is ready to receive txs.
   */
  public isReady() {
    return this.ready;
  }

  /**
   * Method to check the status the p2p client.
   * @returns Information about p2p client status: ready, syncing, syncedRollupId.
   */
  public getStatus() {
    return {
      ready: this.ready,
      syncing: this.syncing,
      syncedRollupId: this.syncedRollupId,
    };
  }

  /**
   * Internal method that uses the provided rollups to check against the client's tx pool.
   * @param rollups - A list of existing rollups with txs that the P2P client needs to ensure the tx pool is reconciled with.
   */
  private reconcileTxPool(rollups: Rollup[]) {
    // TODO: go through provided rollups & reconcile tx pool.
  }
}
