import { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { BlockHash, type BlockParameter, type DataInBlock } from '@aztec/stdlib/block';
import type { BlockIncludeOptions } from '@aztec/stdlib/interfaces/client';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import type {
  LogResult,
  LogsQueryBase,
  PrivateLogsQuery,
  PublicLogsQuery,
  SiloedTag,
  Tag,
  TagQuery,
} from '@aztec/stdlib/logs';
import type { MerkleTreeId } from '@aztec/stdlib/trees';

import { type BenchmarkedAztecNode, withRecording } from './benchmarked_node.js';

/**
 * An {@link AztecNode} wrapper that serves repeated reads from a cache it owns.
 */
export interface CachingAztecNode extends BenchmarkedAztecNode {
  /** Clears the read cache. The owner calls this periodically to bound memory. Cached entries never go stale. */
  wipeCache(): void;
}

/**
 * Wraps `node`, serving repeated reads from a cache the wrapper owns. Consumers share cached reads by sharing the
 * wrapper.
 *
 * Only hash-pinned reads are cached. A block hash names immutable content, so the same call can never correctly answer
 * differently, and even an `undefined` witness or leaf index is kept as a non-membership fact. That makes the wrapper
 * safe for any consumer, whatever its anchor block. Uncached methods, and reads that name a block any other way (see
 * {@link hashReferenceOf}), pass straight through. A few entries below opt out even when hash-pinned, where the answer
 * can still change, and the tag queries opt in only once the request also closes the block range they cover (see
 * {@link isBlockRangePinned}).
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
      return readBatchedPerKey<DataInBlock<bigint> | undefined>(
        cache,
        leafValues.map(leaf => `leaf-index:${referenceHash.toString()}:${treeId}:${leaf.toString()}`),
        missing =>
          source.findLeavesIndexes(
            referenceBlock,
            treeId,
            missing.map(i => leafValues[i]),
          ),
        { method: 'findLeavesIndexes', requested: 'leaves' },
      );
    },

    getPrivateLogsByTags: (query: PrivateLogsQuery) => {
      if (!isBlockRangePinned(query)) {
        return source.getPrivateLogsByTags(query);
      }
      const envelope = `private-logs:${logsQueryKey(query)}`;
      return readBatchedPerKey<LogResult[]>(
        cache,
        query.tags.map(tag => `${envelope}:${tagQueryKey(tag)}`),
        missing => source.getPrivateLogsByTags({ ...query, tags: missing.map(i => query.tags[i]) }),
        { method: 'getPrivateLogsByTags', requested: 'tags' },
      );
    },

    getPublicLogsByTags: (query: PublicLogsQuery) => {
      if (!isBlockRangePinned(query)) {
        return source.getPublicLogsByTags(query);
      }
      const envelope = `public-logs:${keyPart(query.contractAddress)}:${logsQueryKey(query)}`;
      return readBatchedPerKey<LogResult[]>(
        cache,
        query.tags.map(tag => `${envelope}:${tagQueryKey(tag)}`),
        missing => source.getPublicLogsByTags({ ...query, tags: missing.map(i => query.tags[i]) }),
        { method: 'getPublicLogsByTags', requested: 'tags' },
      );
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
    return this.#get<T>(key) ?? this.#set(key, read(), shouldCache);
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

  #set<T>(key: string, promise: Promise<T>, shouldCache?: (value: T) => boolean): Promise<T> {
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
 * The block hash `block` pins to (a `BlockHash` or `{ hash }` reference), or `undefined` for every other way of naming
 * a block.
 *
 * A number or a tag names a moving chain position, as does naming no block at all: a reorg can put a different block
 * at the same number, and tags follow the growing chain. An `{ archive }` root is different, since it commits to every
 * block hash up to its own block and so pins content as tightly as a hash. It stays uncached because no PXE read uses
 * one: keeping an `undefined` answer as a non-membership fact is only sound because PXE pins blocks it has already
 * seen, and that holds for the references PXE actually builds.
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
 * Answers one result per entry of `keys`, taking whatever the cache already holds and fetching the rest in a single
 * batched call. Each fetched result is cached under its own key, so a later call that overlaps this one fetches only
 * the entries it has not seen, and a key repeated within `keys` is asked of the node once.
 *
 * `fetchMissing` receives the indexes still missing, in order, and must answer one result per requested index.
 * `shortResponse` names the method and what it requests, for the error raised when it does not.
 */
function readBatchedPerKey<T>(
  cache: AztecNodeCache,
  keys: string[],
  fetchMissing: (missingIndexes: number[]) => Promise<T[]>,
  shortResponse: { method: string; requested: string },
): Promise<T[]> {
  const cached = cache.peekAll<T>(keys);

  // One request per missing key rather than per missing position, so a key repeated in `keys` seeds a single entry
  // that every position carrying it then reads.
  const requestIndexByKey = new Map<string, number>();
  cached.forEach((result, index) => {
    if (result === undefined && !requestIndexByKey.has(keys[index])) {
      requestIndexByKey.set(keys[index], index);
    }
  });

  const fetchedByKey = new Map<string, Promise<T>>();
  if (requestIndexByKey.size > 0) {
    const requestedIndexes = [...requestIndexByKey.values()];
    const batch = fetchMissing(requestedIndexes).then(fetched => {
      if (fetched.length !== requestedIndexes.length) {
        // Each entry is filled from the batch response by position. If the node returned fewer results than we asked
        // for, the positions past the end would read undefined, which the cache keeps as a genuine answer, so a
        // truncated response would be cached as fact. Rejecting the whole batch evicts those entries instead, so a
        // retry re-fetches every one of them.
        throw new Error(
          `${shortResponse.method} returned ${fetched.length} results for ${requestedIndexes.length} requested ` +
            `${shortResponse.requested}`,
        );
      }
      return fetched;
    });
    [...requestIndexByKey.keys()].forEach((key, batchIndex) => {
      fetchedByKey.set(
        key,
        cache.fetch(key, () => batch.then(fetched => fetched[batchIndex])),
      );
    });
  }

  // Every position is answered: a cache hit, or the entry its key's request seeded just above.
  return Promise.all(keys.map((key, index) => cached[index] ?? fetchedByKey.get(key)!));
}

/**
 * Whether a tag query names a block range fixed enough to cache its answer.
 *
 * Both ends have to be pinned. `referenceBlock` names the chain the answer belongs to and fails the call once that
 * block is gone, but on its own it leaves the top of the range at the chain tip: nothing in the query type promises
 * that an anchor also caps results, so a response kept on that basis would rest on node behavior outside our control.
 * An explicit `toBlock` closes the range in the request itself, making the response a fact about blocks that can no
 * longer change. PXE's tag queries get that bound from `getAllPrivateLogsByTags`, which derives it from the anchor
 * block they are already pinned to.
 */
function isBlockRangePinned(query: LogsQueryBase): boolean {
  return query.referenceBlock !== undefined && query.toBlock !== undefined;
}

/** Cache-key segment for the parts of a tag query that every tag in it shares. */
function logsQueryKey(query: LogsQueryBase): string {
  return [query.referenceBlock, query.fromBlock, query.toBlock, query.txHash, query.includeEffects, query.limitPerTag]
    .map(keyPart)
    .join(':');
}

/**
 * Cache-key segment for one tag entry, covering the pagination cursor as well as the tag: each page of a tag's stream
 * is a read of its own, and a repeated query asks for the same pages in the same order.
 */
function tagQueryKey(entry: TagQuery<Tag | SiloedTag>): string {
  return 'tag' in entry ? `${keyPart(entry.tag)}@${keyPart(entry.afterLog)}` : keyPart(entry);
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
