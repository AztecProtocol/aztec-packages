/**
 * Interface of classes allowing for the retrieval of auxiliary data.
 */
export interface AuxDataSource {
  /**
   * Gets the `take` amount of auxiliary data starting from `from`.
   * @param from - Number of the L2 block to which corresponds the first `auxData` to be returned.
   * @param take - The number of `auxData` to return.
   * @returns The requested `auxData`.
   */
  getAuxData(from: number, take: number): Promise<Buffer[]>;

  /**
   * Starts the aux data source.
   * @returns A promise signalling completion of the start process.
   */
  start(): Promise<void>;

  /**
   * Stops the auxiliary data source.
   * @returns A promise signalling completion of the stop process.
   */
  stop(): Promise<void>;
}
