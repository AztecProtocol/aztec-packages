import { randomBytes } from 'node:crypto';

/**
 * Interface for an Aztec3 transaction.
 */
export interface Tx {
  /**
   * Transaction ID.
   */
  txId: Buffer;
}

export class MockTx {
  constructor(private _txId: Buffer = randomBytes(32)) {}

  get txId() {
    return this._txId;
  }
}
