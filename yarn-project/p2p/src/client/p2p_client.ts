import { Tx } from './temp_types.js';

/**
 * Interface of a P2P client.
 **/
export interface P2P {
  /**
   * Verifies the 'tx' and, if valid, adds it to local tx pool and forwards it to other peers.
   **/
  sendTx(tx: Tx): Promise<void>;

  /**
   * Returns all transactions in the transaction pool.
   * @returns An array of Txs.
   */
  getTxs(): Promise<Tx[]>;
}
