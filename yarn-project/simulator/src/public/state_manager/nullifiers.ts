import type { Fr } from '@aztec/foundation/fields';

import type { PublicTreesDB } from '../public_db_sources.js';

/**
 * A class to manage new nullifier staging and existence checks during a contract call's AVM simulation.
 * Maintains a siloed nullifier cache, and ensures that existence checks fall back to the correct source.
 * When a contract call completes, its cached nullifier set can be merged into its parent's.
 */
export class NullifierManager {
  constructor(
    /** Reference to node storage. Checked on parent cache-miss. */
    private readonly hostNullifiers: PublicTreesDB,
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
   *          cacheHit: whether the nullifier was found in a cache,
   */
  public async checkExists(siloedNullifier: Fr): Promise<{ exists: boolean; cacheHit: boolean }> {
    // Check this cache and parent's (recursively)
    const cacheHit = this.checkExistsHereOrParent(siloedNullifier);
    let existsInTree = false;
    if (!cacheHit) {
      // Finally try the host's Aztec state (a trip to the database)
      //const leafOrLowLeafIndex = await this.hostNullifiers.db.getPreviousValueIndex(MerkleTreeId.NULLIFIER_TREE, siloedNullifier.toBigInt());
      //assert(
      //  leafOrLowLeafIndex !== undefined,
      //  `${MerkleTreeId[MerkleTreeId.NULLIFIER_TREE]} low leaf index should always be found (even if target leaf does not exist)`,
      //);
      //existsInTree = leafOrLowLeafIndex.alreadyPresent;
      const exists = await this.hostNullifiers.checkNullifierExists(siloedNullifier);
      existsInTree = exists;
    }
    const exists = cacheHit || existsInTree;
    return Promise.resolve({ exists, cacheHit });
  }

  /**
   * Stage a new nullifier (append it to the cache).
   *
   * @param siloedNullifier - the nullifier to stage
   */
  public async append(siloedNullifier: Fr) {
    const { exists } = await this.checkExists(siloedNullifier);
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
