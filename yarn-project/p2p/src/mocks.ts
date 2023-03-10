import { RollupSource, Rollup } from './types.js';

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
