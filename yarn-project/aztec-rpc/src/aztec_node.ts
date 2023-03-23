import { AccumulatedTxData } from './circuits.js';

export class TxHash {
  public static SIZE = 32;

  constructor(public readonly buffer: Buffer) {}

  public equals(rhs: TxHash) {
    return this.buffer.equals(rhs.buffer);
  }
}

export class Tx {
  constructor(public readonly proofData: Buffer, public readonly data: AccumulatedTxData) {}

  get txHash() {
    return new TxHash(Buffer.alloc(32));
  }
}

export class AztecNode {
  sendTx(tx: Tx) {
    return Promise.resolve(tx.txHash);
  }

  getBlocks() {
    return Promise.resolve([]);
  }
}
