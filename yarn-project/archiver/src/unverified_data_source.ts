/**
 * Interface of classes allowing for the retrieval of unverified data.
 */
export interface UnverifiedDataSource {
  /**
   * Gets the `take` amount of unverified data starting from `from`.
   * @param from - Number of the L2 block to which corresponds the first `unverifiedData` to be returned.
   * @param take - The number of `unverifiedData` to return.
   * @returns The requested `unverifiedData`.
   */
  getUnverifiedData(from: number, take: number): Promise<Buffer[]>;

  /**
   * Starts the unverified data source.
   * @returns A promise signalling completion of the start process.
   */
  start(): Promise<void>;

  /**
   * Stops the unverified data source.
   * @returns A promise signalling completion of the stop process.
   */
  stop(): Promise<void>;
}
