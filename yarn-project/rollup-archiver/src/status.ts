/**
 * Describes sync status of the archiver.
 */
export interface State {
  /**
   * The height of the rollup block that the archiver is synced to.
   */
  syncedToBlock: number;
  /**
   * Maximum height of a rollup block processed by the rollup contract.
   */
  latestBlock: number;
}

/**
 * Describes functionality of a class which can be queried for its state.
 */
export interface Status {
  state(): State;
}
