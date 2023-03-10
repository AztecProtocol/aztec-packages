import { P2P } from './p2p_client.js';
import { Tx } from './tx.js';

/**
 * Interface defining data contained in a rollup object.
 */
interface Rollup {
  /**
   * The ID of the rollup (block height in L1 terminology).
   */
  id: number;

  /**
   * Timestamp of an L1 block in which the settlement tx containing this rollup was included.
   */
  settlementTimestamp: number;
}

/**
 * Interface of classes allowing for the retrieval of all the relevant rollup information.
 */
interface RollupSource {
  /**
   * Gets the ID of the last rollup.
   * @returns The ID of the last rollup.
   **/
  getLastRollupId(): number;

  /**
   * Gets the `take` rollups starting from ID `from`.
   * @param from - If of the first rollup to return (inclusive).
   * @param take - The number of rollups to return.
   * @returns The requested rollups.
   */
  getRollups(from: number, take: number): Rollup[];
}

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
   * The JS promise that will be running during initial sync. Can be interrupted if the client is stopped.
   */
  private runningSyncPromise!: Promise<void>;

  /**
   * In-memory P2P client constructor.
   * @param rollupSource - P2P client's source for fetching existing rollup data.
   */
  constructor(private rollupSource: RollupSource) {}

  /**
   * Starts the P2P client.
   */
  public start() {
    this.running = true;
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
}
