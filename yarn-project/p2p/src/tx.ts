import { randomBytes } from 'crypto';
import { Keccak } from 'sha3';

import { Tx } from './temp_types.js';

const hash = new Keccak(256);

/**
 * Accumulated data of an A3 transaction.
 */
export class AccumulatedTxData implements Tx {
  constructor(
    private aggregationObject?: object,
    private callCount?: number,
    private newCommitments: Buffer[] = [randomBytes(32)],
    private newNullifiers: Buffer[] = [randomBytes(32)],
    private privateCallStack: Buffer[] = [randomBytes(32)],
    private publicCallStack: Buffer[] = [randomBytes(32)],
    private l1MsgStack: Buffer[] = [randomBytes(32)],
    private newContracts: Buffer[] = [randomBytes(32)],
    private optionallyRevealedData: Buffer[] = [randomBytes(32)],
  ) {}

  /**
   * Construct & return transaction ID.
   * // TODO: actually construct & return tx id
   * @returns The transaction's id.
   */
  get txId() {
    const constractTxData = this.newContracts[0];
    hash.reset();
    return hash.update(constractTxData).digest();
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
