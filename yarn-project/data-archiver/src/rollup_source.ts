import { Rollup } from './rollup.js';

export interface RollupSource {
  getRollups(from: number, take?: number): Promise<Rollup[]>;

  getLatestRollupId(): Promise<number>;
}
