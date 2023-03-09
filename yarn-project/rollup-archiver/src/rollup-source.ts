import { RollupBlockData } from './rollup_block_data/rollup_block_data.js';

/**
 * Interface of classes allowing for the retrieval of all the relevant rollup information.
 */
export interface RollupSource {
  /**
   * Gets the ID of the last rollup.
   * @returns The ID of the last rollup.
   **/
  getLastRollupId(): number;

  /**
   * Gets the `take` rollups starting from ID `from`.
   * @param from - If of the first rollup to return (inclusive).
   * @param take - The number of rollups to return.
   * @returns The requested rollups.
   */
  getRollups(from: number, take: number): RollupBlockData[];
}
