/* eslint-disable jsdoc/require-jsdoc */
import {  PrivateKernelPublicInputs } from '@aztec/circuits.js';
import { Keccak } from 'sha3';

const hash = new Keccak(256);

/**
 * The interface of an L2 transaction.
 */
export class Tx {
  constructor(private txData: PrivateKernelPublicInputs) {}

  /**
   * Construct & return transaction ID.
   * // TODO: actually construct & return tx id.
   * @returns The transaction's id.
   */
  get txId() {
    const contractTxData = this.txData.end.newContracts[0];
    hash.reset();
    // TODO: is toBuffer the correct way to serialize contractTxData to get its digest?
    return hash.update(contractTxData.toBuffer()).digest();
  }

  get data() {
    return this.txData;
  }

  /**
   * Utility function to generate tx ID.
   * @param txData - Binary representation of the tx data.
   * @returns A hash of the tx data that identifies the tx.
   */
  static createTxId(txData: Buffer) {
    hash.reset();
    return hash.update(txData).digest();
  }
}
