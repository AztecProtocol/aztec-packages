/**
 * Interface defining data contained in a rollup object.
 */
export interface Rollup {
  /**
   * The ID of the rollup (block height in L1 terminology).
   */
  id: number;

  /**
   * Timestamp of an L1 block in which the settlement tx containing this rollup was included.
   */
  settlementTimestamp: number;
}

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
  getRollups(from: number, take: number): Rollup[];
}
