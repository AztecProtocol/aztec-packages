import { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { BlockHash, type BlockParameter, type DataInBlock } from '@aztec/stdlib/block';
import type { BlockIncludeOptions } from '@aztec/stdlib/interfaces/client';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import type { MerkleTreeId } from '@aztec/stdlib/trees';

import { type BenchmarkedAztecNode, withRecording } from './benchmarked_node.js';

/**
 * An {@link AztecNode} wrapper that serves repeated reads from a cache it owns.
 */
export interface CachingAztecNode extends BenchmarkedAztecNode {
  /** Clears the read cache. The cache owner calls this on reorg, the only event that can change a hash-pinned read. */
  wipeCache(): void;
}

/**
 * Wraps `node`, serving repeated reads from a cache the wrapper owns. Consumers share cached reads by sharing the
 * wrapper.
 *
 * Only hash-pinned reads are cached. A block hash names immutable content, so the same call can never correctly answer
 * differently, and even an `undefined` witness or leaf index is kept as a non-membership fact. That makes the wrapper
 * safe for any consumer, whatever its anchor block. Uncached methods, and reads pinned by number or tag, pass straight
 * through, since those name a moving chain position. A few entries below opt out even when hash-pinned, where the
 * answer can still change.
 *
 * Wiping (see {@link CachingAztecNode.wipeCache}) bounds memory. Correctness does not depend on it.
 */
export function withCache(node: AztecNode): CachingAztecNode {
  const cache = new AztecNodeCache();
  // The recording wrapper sits below the cache, so a recording sees only the reads the node answered: a read served
  // from the cache appears nowhere in it. Every read below goes to `source` rather than to `node`, and
  // `startRecording` passes through this wrapper untouched.
  const source = withRecording(node);

  /** Runs `read` through `cache` when `block` pins a chain position by hash. Everything else goes to the node. */
  const readCachedIfBlockIsHashPinned = <T>(
    block: BlockParameter | undefined,
    key: (blockHash: string) => string,
    read: () => Promise<T>,
    options?: { shouldCache?: (value: T) => boolean },
  ): Promise<T> => {
    const blockHash = hashReferenceOf(block);
    return blockHash === undefined ? read() : cache.fetch(key(blockHash.toString()), read, options);
  };

  const cachedReads: { [K in keyof AztecNode]?: (...args: Parameters<AztecNode[K]>) => ReturnType<AztecNode[K]> } = {
    getBlock: (block: BlockParameter, options?: BlockIncludeOptions) => {
      if (options?.includeL1PublishInfo || options?.includeAttestations) {
        // These payloads keep changing after a block is fixed (its L1 publication status, its incoming committee
        // attestations), so a repeat can correctly differ; read straight from the node.
        return source.getBlock(block, options);
      }
      return readCachedIfBlockIsHashPinned(
        block,
        blockHash => `block:${blockHash}:${keyPart(options)}`,
        () => source.getBlock(block, options),
        {
          // PXE only asks for pinned blocks it has already observed, so an undefined answer means the node has not
          // served the block yet, not that it never will.
          shouldCache: response => response !== undefined,
        },
      );
    },

    getContract: (address: AztecAddress, referenceBlock?: BlockParameter) =>
      readCachedIfBlockIsHashPinned(
        referenceBlock,
        blockHash => `contract:${blockHash}:${address.toString()}`,
        () => source.getContract(address, referenceBlock),
      ),

    getBlockHashMembershipWitness: (referenceBlock: BlockParameter, blockHash: BlockHash) =>
      readCachedIfBlockIsHashPinned(
        referenceBlock,
        referenceHash => `block-hash-membership-witness:${referenceHash}:${blockHash.toString()}`,
        () => source.getBlockHashMembershipWitness(referenceBlock, blockHash),
      ),

    getPublicDataWitness: (referenceBlock: BlockParameter, leafSlot: Fr) =>
      readCachedIfBlockIsHashPinned(
        referenceBlock,
        blockHash => `public-data-witness:${blockHash}:${leafSlot.toString()}`,
        () => source.getPublicDataWitness(referenceBlock, leafSlot),
      ),

    getNoteHashMembershipWitness: (referenceBlock: BlockParameter, noteHash: Fr) =>
      readCachedIfBlockIsHashPinned(
        referenceBlock,
        blockHash => `note-hash-membership-witness:${blockHash}:${noteHash.toString()}`,
        () => source.getNoteHashMembershipWitness(referenceBlock, noteHash),
      ),

    getNullifierMembershipWitness: (referenceBlock: BlockParameter, nullifier: Fr) =>
      readCachedIfBlockIsHashPinned(
        referenceBlock,
        blockHash => `nullifier-membership-witness:${blockHash}:${nullifier.toString()}`,
        () => source.getNullifierMembershipWitness(referenceBlock, nullifier),
      ),

    getLowNullifierMembershipWitness: (referenceBlock: BlockParameter, nullifier: Fr) =>
      readCachedIfBlockIsHashPinned(
        referenceBlock,
        blockHash => `low-nullifier-membership-witness:${blockHash}:${nullifier.toString()}`,
        () => source.getLowNullifierMembershipWitness(referenceBlock, nullifier),
      ),

    getL1ToL2MessageMembershipWitness: (referenceBlock: BlockParameter, l1ToL2Message: Fr) =>
      readCachedIfBlockIsHashPinned(
        referenceBlock,
        blockHash => `l1-to-l2-message-membership-witness:${blockHash}:${l1ToL2Message.toString()}`,
        () => source.getL1ToL2MessageMembershipWitness(referenceBlock, l1ToL2Message),
      ),

    getPublicStorageAt: (referenceBlock: BlockParameter, contractAddress: AztecAddress, storageSlot: Fr) =>
      readCachedIfBlockIsHashPinned(
        referenceBlock,
        blockHash => `public-storage:${blockHash}:${contractAddress.toString()}:${storageSlot.toString()}`,
        () => source.getPublicStorageAt(referenceBlock, contractAddress, storageSlot),
      ),

    findLeavesIndexes: (referenceBlock: BlockParameter, treeId: MerkleTreeId, leafValues: Fr[]) => {
      // Cached per leaf: only leaves without a cached result are fetched, in a single batched node call. The per-leaf
      // keys don't fit single-key readCachedIfBlockIsHashPinned, so the hash gate is inline.
      const referenceHash = hashReferenceOf(referenceBlock);
      if (referenceHash === undefined) {
        return source.findLeavesIndexes(referenceBlock, treeId, leafValues);
      }
      const keys = leafValues.map(leaf => `leaf-index:${referenceHash.toString()}:${treeId}:${leaf.toString()}`);
      const results = cache.peekAll<DataInBlock<bigint> | undefined>(keys);
      const missIndexes = results.flatMap((result, i) => (result === undefined ? [i] : []));
      if (missIndexes.length > 0) {
        const batch = source
          .findLeavesIndexes(
            referenceBlock,
            treeId,
            missIndexes.map(i => leafValues[i]),
          )
          .then(fetched => {
            if (fetched.length !== missIndexes.length) {
              // A correct node returns one result per requested leaf. A short response would otherwise be indexed
              // positionally and cached as durable non-membership for the missing tail; reject instead so the derived
              // entries evict and callers retry.
              throw new Error(
                `findLeavesIndexes returned ${fetched.length} results for ${missIndexes.length} requested leaves`,
              );
            }
            return fetched;
          });
        missIndexes.forEach((missIndex, batchIndex) => {
          results[missIndex] = cache.fetch(keys[missIndex], () => batch.then(fetched => fetched[batchIndex]));
        });
      }
      return Promise.all(results);
    },
  };

  return new Proxy(source, {
    get(target, prop) {
      if (prop === 'wipeCache') {
        return () => cache.wipe();
      }
      if (Object.hasOwn(cachedReads, prop)) {
        return cachedReads[prop as keyof AztecNode];
      }
      const value = Reflect.get(target, prop);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as CachingAztecNode;
}

/**
 * Store of node read promises keyed by method and arguments.
 *
 * Holds no node reference of its own: it only memoizes promises handed to it by the {@link withCache} wrapper that
 * owns it. Rejected promises are evicted so callers can retry. A settled value is kept unless the caller's
 * `shouldCache` turns it away.
 */
class AztecNodeCache {
  private readonly cache = new Map<string, Promise<unknown>>();

  /**
   * Returns the cached promise for `key`, or runs `read` and caches the in-flight promise.
   *
   * `shouldCache` runs once the promise settles and answers whether its value is kept. Every settled value is kept by
   * default. Callers waiting on a value that is then turned away still share the one in-flight read, so declining to
   * keep a value costs nothing on concurrent reads.
   */
  public fetch<T>(
    key: string,
    read: () => Promise<T>,
    { shouldCache }: { shouldCache?: (value: T) => boolean } = {},
  ): Promise<T> {
    return this.#get<T>(key) ?? this.set(key, read(), shouldCache);
  }

  /**
   * The cached promise for each of `keys`, `undefined` where there is none. For callers that batch their own misses
   * rather than reading one key.
   */
  public peekAll<T>(keys: string[]): (Promise<T> | undefined)[] {
    return keys.map(key => this.#get<T>(key));
  }

  /**
   * Clears the store.
   */
  public wipe(): void {
    this.cache.clear();
  }

  #get<T>(key: string): Promise<T> | undefined {
    return this.cache.get(key) as Promise<T> | undefined;
  }

  private set<T>(key: string, promise: Promise<T>, shouldCache?: (value: T) => boolean): Promise<T> {
    const evict = () => {
      if (this.cache.get(key) === promise) {
        this.cache.delete(key);
      }
    };
    // A rejected read is evicted so callers can retry; a `shouldCache` that throws is treated the same way. The
    // trailing catch keeps a throwing predicate from surfacing as an unhandled rejection on this detached promise.
    promise
      .then(value => {
        if (shouldCache && !shouldCache(value)) {
          evict();
        }
      }, evict)
      .catch(evict);
    this.cache.set(key, promise);
    return promise;
  }
}

/**
 * The block hash `block` pins to (a `BlockHash` or `{ hash }` reference), or `undefined` for any other reference and
 * for no reference at all, since a caller naming no block reads the latest one.
 */
function hashReferenceOf(block: BlockParameter | undefined): BlockHash | undefined {
  if (block instanceof BlockHash) {
    return block;
  }
  if (typeof block === 'object' && block !== null && 'hash' in block) {
    return block.hash;
  }
  return undefined;
}

/**
 * Renders a call argument as a stable cache-key segment, via its own `toString` when it has one, else as JSON.
 *
 * Example: the options object `{ includeTransactions: true }` renders as `'{"includeTransactions":true}'`, and an
 * absent optional argument as `'undefined'`.
 */
function keyPart(value: unknown): string {
  if (['string', 'number', 'bigint', 'boolean'].includes(typeof value)) {
    return String(value);
  }
  if (value && typeof value === 'object') {
    const toString = (value as { toString?: () => string }).toString;
    if (toString && toString !== Object.prototype.toString) {
      return toString.call(value);
    }
    return JSON.stringify(value, (_key, nested) => (typeof nested === 'bigint' ? nested.toString() : nested));
  }
  return String(value);
}
