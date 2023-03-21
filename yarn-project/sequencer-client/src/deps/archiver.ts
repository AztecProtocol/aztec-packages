import { EventEmitter } from 'stream';

export interface Rollup {
  rollupId: number;
  commitments: Buffer[];
}

export interface RollupEmitter extends EventEmitter {
  /**
   * Returns up to `take` rollups from rollup id `from`.
   * This does not guarantee all rollups are returned. It may return a subset, and the
   * client should use `getLatestRollupId()` to determine if it needs to make further requests.
   */
  getRollups(from: number, take?: number): Promise<Rollup[]>;

  /**
   * Starts emitting rollup blocks.
   * If syncInitial == true, all blocks from `fromRollup` will be emitted before the function ends
   */
  start(fromRollup?: number, syncInitial?: boolean): void;

  stop(): Promise<void>;

  on(event: 'rollup', fn: (rollup: Rollup) => void): this;

  removeAllListeners(): this;

  getLatestRollupId(): Promise<number>;
}

export interface RollupSource {
  getRollups(from: number, take?: number): Promise<Rollup[]>;

  getLatestRollupId(): Promise<number>;
}