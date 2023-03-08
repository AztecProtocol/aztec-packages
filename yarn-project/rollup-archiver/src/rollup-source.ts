export interface Rollup {
  id: number;
  settlementTimestamp: number;
  // TODO
}

export interface RollupSource {
  getLastRollupId(): Promise<number>;
  getRollups(from: number, take: number): Promise<Rollup[]>;
}
