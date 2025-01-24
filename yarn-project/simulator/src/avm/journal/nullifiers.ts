import { Fr } from '@aztec/foundation/fields';

import type { CommitmentsDB } from '../../server.js';

/**
 * A class to manage new nullifier staging and existence checks during a contract call's AVM simulation.
 * Maintains a siloed nullifier cache, and ensures that existence checks fall back to the correct source.
 * When a contract call completes, its cached nullifier set can be merged into its parent's.
 */
export class NullifierManager {
  constructor(
    /** Reference to node storage. Checked on parent cache-miss. */
    private readonly hostNullifiers: CommitmentsDB,
    /** Cache of siloed nullifiers. */
    private cache: Set<bigint> = new Set(),
    /** Parent nullifier manager to fall back on */
    private readonly parent?: NullifierManager,
  ) {}

  /**
   * Create a new nullifiers manager forked from this one
   */
  public fork() {
    return new NullifierManager(this.hostNullifiers, new Set(), this);
  }

  /**
   * Get a nullifier's existence in this' cache or parent's (recursively).
   * DOES NOT CHECK HOST STORAGE!
   * @param siloedNullifier - the nullifier to check for
   * @returns exists: whether the nullifier exists in cache here or in parent's
   */
  private checkExistsHereOrParent(siloedNullifier: Fr): boolean {
    // First check this cache
    let existsAsPending = this.cache.has(siloedNullifier.toBigInt());
    // Then try parent's nullifier cache
    if (!existsAsPending && this.parent) {
      // Note: this will recurse to grandparent/etc until a cache-hit is encountered.
      existsAsPending = this.parent.checkExistsHereOrParent(siloedNullifier);
    }
    return existsAsPending;
  }

  /**
   * Get a nullifier's existence status.
   * 1. Check cache.
   * 2. Check parent cache.
   * 3. Fall back to the host state.
   * 4. Not found! Nullifier does not exist.
   *
   * @param siloedNullifier - the nullifier to check for
   * @returns exists: whether the nullifier exists at all,
   *          isPending: whether the nullifier was found in a cache,
   *          leafIndex: the nullifier's leaf index if it exists and is not pending (comes from host state).
   */
  public async checkExists(
    siloedNullifier: Fr,
  ): Promise<[/*exists=*/ boolean, /*isPending=*/ boolean, /*leafIndex=*/ Fr]> {
    // Check this cache and parent's (recursively)
    const existsAsPending = this.checkExistsHereOrParent(siloedNullifier);
    // Finally try the host's Aztec state (a trip to the database)
    // If the value is found in the database, it will be associated with a leaf index!
    let leafIndex: bigint | undefined = undefined;
    if (!existsAsPending) {
      // silo the nullifier before checking for its existence in the host
      leafIndex = await this.hostNullifiers.getNullifierIndex(siloedNullifier);
    }
    const exists = existsAsPending || leafIndex !== undefined;
    leafIndex = leafIndex === undefined ? BigInt(0) : leafIndex;
    return Promise.resolve([exists, existsAsPending, new Fr(leafIndex)]);
  }

  /**
   * Stage a new nullifier (append it to the cache).
   *
   * @param siloedNullifier - the nullifier to stage
   */
  public async append(siloedNullifier: Fr) {
    const [exists, ,] = await this.checkExists(siloedNullifier);
    if (exists) {
      throw new NullifierCollisionError(`Siloed nullifier ${siloedNullifier} already exists in parent cache or host.`);
    }
    this.cache.add(siloedNullifier.toBigInt());
  }

  /**
   * Merges another nullifier cache into this one.
   *
   * @param incomingNullifiers - the incoming cached nullifiers to merge into this instance's
   */
  public acceptAndMerge(incomingNullifiers: NullifierManager) {
    for (const incomingNullifier of incomingNullifiers.cache) {
      if (this.cache.has(incomingNullifier)) {
        throw new NullifierCollisionError(
          `Failed to merge in fork's cached nullifiers. Siloed nullifier ${incomingNullifier} already exists in parent cache.`,
        );
      }
    }
    this.cache = new Set([...this.cache, ...incomingNullifiers.cache]);
  }
}

export class NullifierCollisionError extends Error {
  constructor(message: string, ...rest: any[]) {
    super(message, ...rest);
    this.name = 'NullifierCollisionError';
  }
}
