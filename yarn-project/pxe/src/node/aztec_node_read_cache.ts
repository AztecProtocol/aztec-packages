import { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { BlockHash, BlockParameter, DataInBlock } from '@aztec/stdlib/block';
import type { BlockIncludeOptions } from '@aztec/stdlib/interfaces/client';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import type { MerkleTreeId } from '@aztec/stdlib/trees';
import { type GetTxReceiptOptions, type TxHash, type TxReceipt, TxStatus } from '@aztec/stdlib/tx';

/**
 * Store of node read promises keyed by method and arguments.
 *
 * Holds no node reference of its own: it only memoizes promises handed to it by {@link withReadCache} wrappers, which
 * lets several wrappers share one store. Rejected promises are evicted so callers can retry. A settled value is kept
 * unless the caller's `shouldCache` turns it away.
 */
export class AztecNodeReadCache {
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
    const cached = this.get<T>(key);
    if (cached) {
      return cached;
    }
    return this.set(key, read(), shouldCache);
  }

  /** Returns the cached promise for `key`, if any. */
  public get<T>(key: string): Promise<T> | undefined {
    return this.cache.get(key) as Promise<T> | undefined;
  }

  /**
   * Clears the store.
   */
  public wipe(): void {
    this.cache.clear();
  }

  private set<T>(key: string, promise: Promise<T>, shouldCache?: (value: T) => boolean): Promise<T> {
    const evict = () => {
      if (this.cache.get(key) === promise) {
        this.cache.delete(key);
      }
    };
    promise.then(value => {
      if (shouldCache && !shouldCache(value)) {
        evict();
      }
    }, evict);
    this.cache.set(key, promise);
    return promise;
  }
}

/**
 * Wraps `node`, serving repeated reads from `cache`.
 *
 * The caching rule: a result is kept only if a repeat of the same call could never correctly return anything
 * different, up to reorgs, which wipe the cache. PXE trusts the node to answer correctly, so any answer about a
 * pinned reference block is such a result, including an `undefined` witness or leaf index stating non-membership.
 * Methods outside the cached set pass through untouched. The reads that can answer differently on repeat opt out at
 * their own entries below.
 *
 * Tag-referenced reads (`'latest'`, `{ tag: 'proven' }`, ...) always pass through to the node: a tag names a moving
 * chain position, so a repeat can answer differently without the cache owner ever wiping.
 *
 * Cached results are immutable up to reorgs, so the wrapped node must not outlive the anchor block of whoever owns
 * `cache` (see {@link AztecNodeReadCache.wipe}), and pinned reads must stay at or below that anchor: the wipe only
 * covers reorgs that move it, so an entry pinned above the anchor could outlive a reorg that unmade it.
 */
export function withReadCache(node: AztecNode, cache: AztecNodeReadCache): AztecNode {
  /** Runs `read` through `cache` when `block` pins a chain position. Tag references go straight to the node. */
  const readCachedIfBlockIsPinned = <T>(
    block: BlockParameter,
    key: string,
    read: () => Promise<T>,
    options?: { shouldCache?: (value: T) => boolean },
  ): Promise<T> => (isTagReference(block) ? read() : cache.fetch(key, read, options));

  const cachedReads: { [K in keyof AztecNode]?: (...args: Parameters<AztecNode[K]>) => ReturnType<AztecNode[K]> } = {
    getBlock: (block: BlockParameter, options?: BlockIncludeOptions) =>
      readCachedIfBlockIsPinned(
        block,
        `block:${keyPart(block)}:${keyPart(options)}`,
        () => node.getBlock(block, options),
        {
          // PXE only asks for pinned blocks it has already observed, so an undefined answer means the node has not
          // served the block yet, not that it never will.
          shouldCache: response => response !== undefined,
        },
      ),

    getTxReceipt: (txHash: TxHash, options?: GetTxReceiptOptions) => {
      if (options?.includePendingTx || options?.includeProof) {
        // The requested payloads exist only on unmined receipts, which the cache never keeps.
        return node.getTxReceipt(txHash, options);
      }
      const read = () => node.getTxReceipt(txHash, options);
      // Below FINALIZED a receipt is tip-derived and can advance, drop or reorg with no event for the cache owner
      // to react to. FINALIZED is the one status that cannot change.
      const keepIfFinalized = (receipt: TxReceipt) => receipt.status === TxStatus.FINALIZED;
      const withEffectKey = `tx-receipt:${txHash.toString()}:with-effect`;
      if (options?.includeTxEffect) {
        return cache.fetch(withEffectKey, read, { shouldCache: keepIfFinalized });
      }
      // A with-effect receipt is a superset of a plain one, so a plain read falls back to it. The plain entry wins
      // so that a failing with-effect read cannot reject a caller whose own entry already holds the answer.
      const plainKey = `tx-receipt:${txHash.toString()}`;
      return (
        cache.get<TxReceipt>(plainKey) ??
        cache.get<TxReceipt>(withEffectKey) ??
        cache.fetch(plainKey, read, { shouldCache: keepIfFinalized })
      );
    },

    getBlockHashMembershipWitness: (referenceBlock: BlockParameter, blockHash: BlockHash) =>
      readCachedIfBlockIsPinned(
        referenceBlock,
        `block-hash-membership-witness:${keyPart(referenceBlock)}:${blockHash.toString()}`,
        () => node.getBlockHashMembershipWitness(referenceBlock, blockHash),
      ),

    getPublicDataWitness: (referenceBlock: BlockParameter, leafSlot: Fr) =>
      readCachedIfBlockIsPinned(
        referenceBlock,
        `public-data-witness:${keyPart(referenceBlock)}:${leafSlot.toString()}`,
        () => node.getPublicDataWitness(referenceBlock, leafSlot),
      ),

    getNoteHashMembershipWitness: (referenceBlock: BlockParameter, noteHash: Fr) =>
      readCachedIfBlockIsPinned(
        referenceBlock,
        `note-hash-membership-witness:${keyPart(referenceBlock)}:${noteHash.toString()}`,
        () => node.getNoteHashMembershipWitness(referenceBlock, noteHash),
      ),

    getNullifierMembershipWitness: (referenceBlock: BlockParameter, nullifier: Fr) =>
      readCachedIfBlockIsPinned(
        referenceBlock,
        `nullifier-membership-witness:${keyPart(referenceBlock)}:${nullifier.toString()}`,
        () => node.getNullifierMembershipWitness(referenceBlock, nullifier),
      ),

    getLowNullifierMembershipWitness: (referenceBlock: BlockParameter, nullifier: Fr) =>
      readCachedIfBlockIsPinned(
        referenceBlock,
        `low-nullifier-membership-witness:${keyPart(referenceBlock)}:${nullifier.toString()}`,
        () => node.getLowNullifierMembershipWitness(referenceBlock, nullifier),
      ),

    getL1ToL2MessageMembershipWitness: (referenceBlock: BlockParameter, l1ToL2Message: Fr) =>
      readCachedIfBlockIsPinned(
        referenceBlock,
        `l1-to-l2-message-membership-witness:${keyPart(referenceBlock)}:${l1ToL2Message.toString()}`,
        () => node.getL1ToL2MessageMembershipWitness(referenceBlock, l1ToL2Message),
      ),

    getPublicStorageAt: (referenceBlock: BlockParameter, contractAddress: AztecAddress, storageSlot: Fr) =>
      readCachedIfBlockIsPinned(
        referenceBlock,
        `public-storage:${keyPart(referenceBlock)}:${contractAddress.toString()}:${storageSlot.toString()}`,
        () => node.getPublicStorageAt(referenceBlock, contractAddress, storageSlot),
      ),

    findLeavesIndexes: (referenceBlock: BlockParameter, treeId: MerkleTreeId, leafValues: Fr[]) => {
      // Cached per leaf: only leaves without a cached result are fetched, in a single batched node call. The per-leaf
      // keys don't fit single-key readCachedIfBlockIsPinned, so the tag bypass is inline.
      if (isTagReference(referenceBlock)) {
        return node.findLeavesIndexes(referenceBlock, treeId, leafValues);
      }
      const keys = leafValues.map(leaf => `leaf-index:${keyPart(referenceBlock)}:${treeId}:${leaf.toString()}`);
      const results = keys.map(key => cache.get<DataInBlock<bigint> | undefined>(key));
      const missIndexes = results.flatMap((result, i) => (result === undefined ? [i] : []));
      if (missIndexes.length > 0) {
        const batch = node.findLeavesIndexes(
          referenceBlock,
          treeId,
          missIndexes.map(i => leafValues[i]),
        );
        missIndexes.forEach((missIndex, batchIndex) => {
          results[missIndex] = cache.fetch(keys[missIndex], () => batch.then(fetched => fetched[batchIndex]));
        });
      }
      return Promise.all(results);
    },
  };

  return new Proxy(node, {
    get(target, prop: keyof AztecNode) {
      if (Object.hasOwn(cachedReads, prop)) {
        return cachedReads[prop];
      }
      const value = target[prop];
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

/** Whether `block` references a chain tip by tag rather than pinning a position (number, hash, or archive root). */
function isTagReference(block: BlockParameter): boolean {
  return typeof block === 'string' || (typeof block === 'object' && 'tag' in block);
}

/**
 * Renders a call argument as a stable cache-key segment, via its own `toString` when it has one, else as JSON.
 *
 * Example: a block hash renders as its hex string, the options object `{ includeTransactions: true }` as
 * `'{"includeTransactions":true}'`, and an absent optional argument as `'undefined'`.
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
