/* eslint-disable jsdoc/require-jsdoc */
import { randomBytes } from 'crypto';
import { L2BlockSource, L2Block } from '@aztec/archiver';

import { Tx } from './temp_types.js';

export class MockTx implements Tx {
  constructor(private _txId: Buffer = randomBytes(32)) {}

  get txId() {
    return this._txId;
  }
}

export class MockBlockSource implements L2BlockSource {
  private l2Blocks: L2Block[];

  constructor() {
    this.l2Blocks = [];
    for (let i = 0; i++; i < 99) {
      this.l2Blocks.push(new MockBlock(i));
    }
  }

  public getLatestBlockNum() {
    return this.l2Blocks.length;
  }

  public getL2Blocks(from: number, take: number) {
    return this.l2Blocks.slice(from, from + take);
  }
}

export class MockBlock implements L2Block {
  constructor(private _id: number) {}

  get number() {
    return this._id;
  }

  get settlementTimestamp() {
    return Date.now();
  }
}
