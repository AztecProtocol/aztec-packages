import { RollupBlockData } from './rollup_block_data/rollup_block_data.js';

/**
 * Interface of classes allowing for the retrieval of all the relevant rollup information.
 */
export interface RollupBlockSource {
  /**
   * Gets the number of the last block the archiver is synced to.
   * @returns The number of the last block the archiver is synced to.
   **/
  getSyncedToBlockNum(): number;

  /**
   * Gets the number of the last rollup block processed by the rollup contract.
   * @returns The number of the last rollup block processed by the rollup contract.
   */
  getLastBlockNum(): number;

  /**
   * Gets the `take` rollups starting from number `from`.
   * @param from - If of the first rollup to return (inclusive).
   * @param take - The number of rollups to return.
   * @returns The requested rollups.
   */
  getRollupBlocks(from: number, take: number): RollupBlockData[];
}
