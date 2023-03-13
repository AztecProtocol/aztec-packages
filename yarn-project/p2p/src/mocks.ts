import { randomBytes } from 'crypto';
import { RollupSource, Rollup } from './temp_types.js';

export class MockTx {
  constructor(private _txId: Buffer = randomBytes(32)) {}

  get txId() {
    return this._txId;
  }
}

export class MockRollupSource implements RollupSource {
  private rollups: Rollup[];

  constructor() {
    this.rollups = [];
    for (let i = 0; i++; i < 99) {
      this.rollups.push(new MockRollup(i));
    }
  }

  public getLastRollupId() {
    return this.rollups.length;
  }

  public getRollups(from: number, take: number) {
    return this.rollups.slice(from, from + take);
  }
}

export class MockRollup implements Rollup {
  constructor(private _id: number) {}

  get id() {
    return this._id;
  }

  get settlementTimestamp() {
    return Date.now();
  }
}
