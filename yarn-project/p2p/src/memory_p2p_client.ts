import { P2P } from './p2p_client.js';
import { Tx } from './tx.js';

/**
 * An in-memory implementation of the P2P client.
 */
export class MemoryP2PCLient implements P2P {
  /**
   * Property that gets updated when the client starts/stops running.
   */
  private running = false;

  /**
   * In-memory P2P client constructor.
   */
  constructor() {}

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
