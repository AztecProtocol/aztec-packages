import { HashedValues } from '@aztec/circuit-types';
import { Fr } from '@aztec/circuits.js';

/**
 * A cache for hashed values (arguments, returns) during transaction execution.
 */
export class HashedValuesCache {
  private cache: Map<bigint, Fr[]>;

  constructor(initialArguments: HashedValues[] = []) {
    this.cache = new Map();
    for (const initialArg of initialArguments) {
      this.cache.set(initialArg.hash.toBigInt(), initialArg.values);
    }
  }

  /**
   * Creates a new hashed values cache.
   * @param initialArguments - The initial arguments to add to the cache.
   * @returns The new hashed values cache.
   */
  public static create(initialArguments: HashedValues[] = []) {
    return new HashedValuesCache(initialArguments);
  }

  /**
   * Gets preimage of a hash.
   * @param hash - The hash to get the preimage of.
   * @returns The preimage.
   */
  public getPreimage(hash: Fr): Fr[] {
    if (hash.equals(Fr.ZERO)) {
      return [];
    }
    const hashedValues = this.cache.get(hash.value);
    if (!hashedValues) {
      throw new Error(`Preimage for hash ${hash.toString()} not found in cache`);
    }
    return hashedValues;
  }

  /**
   * Stores values in cache and returns its hash.
   * @param values - The values to store.
   * @returns The hash of the values.
   */
  public store(values: Fr[]) {
    if (values.length === 0) {
      return Fr.ZERO;
    }
    const hashedValues = HashedValues.fromValues(values);
    this.cache.set(hashedValues.hash.value, hashedValues.values);
    return hashedValues.hash;
  }
}
