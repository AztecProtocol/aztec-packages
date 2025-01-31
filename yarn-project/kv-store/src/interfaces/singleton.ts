/**
 * Represents a singleton value in the database.
 * Note: The singleton loses type info so it's recommended to serialize to buffer when storing it.
 */
interface AztecBaseSingleton<T> {
  /**
   * Sets the value.
   * @param val - The new value
   */
  set(val: T): Promise<boolean>;

  /**
   * Deletes the value.
   */
  delete(): Promise<boolean>;
}
export interface AztecSingleton<T> extends AztecBaseSingleton<T> {
  /**
   * Gets the value.
   */
  get(): T | undefined;
}

export interface AztecAsyncSingleton<T> extends AztecBaseSingleton<T> {
  /**
   * Gets the value.
   */
  getAsync(): Promise<T | undefined>;
}
