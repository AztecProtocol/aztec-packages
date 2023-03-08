import { EventEmitter } from 'stream';
import { Rollup } from './rollup.js';

export interface RollupRetriever {
  /**
   * Returns up to `take` rollups from rollup id `from`.
   * This does not guarantee all rollups are returned. It may return a subset, and the
   * client should use `getLatestRollupId()` to determine if it needs to make further requests.
   */
  getRollups(from: number, take?: number): Promise<Rollup[]>;

  getLatestRollupId(): Promise<number>;
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
   * All historical blocks must have been emitted before this function returns.
   */
  start(fromRollup?: number): void;

  stop(): Promise<void>;

  on(event: 'rollup', fn: (rollup: Rollup) => void): this;

  removeAllListeners(): this;

  getLatestRollupId(): Promise<number>;
}
