import { Fr } from '@aztec/foundation/fields';
import { HashedValues } from '@aztec/stdlib/tx';

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
  public getPreimage(hash: Fr): Fr[] | undefined {
    if (hash.isEmpty()) {
      return [];
    } else {
      return this.cache.get(hash.toBigInt());
    }
  }

  /**
   * Stores values in cache and returns its hash.
   * @param values - The values to store.
   * @returns The hash of the values.
   */
  public store(values: Fr[], hash: Fr) {
    this.cache.set(hash.toBigInt(), values);
  }
}
