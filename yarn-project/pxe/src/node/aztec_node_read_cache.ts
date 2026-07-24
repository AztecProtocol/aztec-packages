import { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { BlockHash, BlockParameter } from '@aztec/stdlib/block';
import type { BlockIncludeOptions } from '@aztec/stdlib/interfaces/client';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import type { MerkleTreeId } from '@aztec/stdlib/trees';
import type { GetTxReceiptOptions, TxHash } from '@aztec/stdlib/tx';

/**
 * Store of node read promises keyed by method and arguments.
 *
 * Holds no node reference of its own: it only memoizes promises handed to it by {@link withReadCache} wrappers, which
 * lets several wrappers share one store. Rejected promises are evicted so callers can retry.
 */
export class AztecNodeReadCache {
  private readonly cache = new Map<string, Promise<unknown>>();

  /** Returns the cached promise for `key`, or runs `fetch` and caches the in-flight promise. */
  public fetch<T>(key: string, fetch: () => Promise<T>): Promise<T> {
    const cached = this.get<T>(key);
    if (cached) {
      return cached;
    }
    return this.set(key, fetch());
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

  private set<T>(key: string, promise: Promise<T>): Promise<T> {
    promise.catch(() => {
      if (this.cache.get(key) === promise) {
        this.cache.delete(key);
      }
    });
    this.cache.set(key, promise);
    return promise;
  }
}

/**
 * Wraps `node`, serving repeated immutable reads from `cache`.
 *
 * Only reads whose result is a fixed fact of the chain at the requested reference block are cached (witnesses, leaf
 * indexes, public storage, blocks, tx receipts). Every other method passes through untouched. `findLeavesIndexes` is
 * cached per leaf: only leaves without a cached result are fetched, in a single batched node call.
 *
 * Tx receipts and block-number-keyed lookups are only immutable up to chain growth and reorgs, so the wrapped node
 * must not outlive the anchor block of whoever owns `cache` (see {@link AztecNodeReadCache.wipe}).
 */
export function withReadCache(node: AztecNode, cache: AztecNodeReadCache): AztecNode {
  const cachedReads: Partial<Record<keyof AztecNode, (...args: never[]) => Promise<unknown>>> = {
    getBlock: (block: BlockParameter, options?: BlockIncludeOptions) =>
      cache.fetch(`block:${keyPart(block)}:${keyPart(options)}`, () => node.getBlock(block, options)),

    getTxReceipt: (txHash: TxHash, options?: GetTxReceiptOptions) =>
      cache.fetch(`tx-receipt:${txHash.toString()}:${keyPart(options)}`, () => node.getTxReceipt(txHash, options)),

    getBlockHashMembershipWitness: (referenceBlock: BlockParameter, blockHash: BlockHash) =>
      cache.fetch(`block-hash-membership-witness:${keyPart(referenceBlock)}:${blockHash.toString()}`, () =>
        node.getBlockHashMembershipWitness(referenceBlock, blockHash),
      ),

    getPublicDataWitness: (referenceBlock: BlockParameter, leafSlot: Fr) =>
      cache.fetch(`public-data-witness:${keyPart(referenceBlock)}:${leafSlot.toString()}`, () =>
        node.getPublicDataWitness(referenceBlock, leafSlot),
      ),

    getNoteHashMembershipWitness: (referenceBlock: BlockParameter, noteHash: Fr) =>
      cache.fetch(`note-hash-membership-witness:${keyPart(referenceBlock)}:${noteHash.toString()}`, () =>
        node.getNoteHashMembershipWitness(referenceBlock, noteHash),
      ),

    getNullifierMembershipWitness: (referenceBlock: BlockParameter, nullifier: Fr) =>
      cache.fetch(`nullifier-membership-witness:${keyPart(referenceBlock)}:${nullifier.toString()}`, () =>
        node.getNullifierMembershipWitness(referenceBlock, nullifier),
      ),

    getLowNullifierMembershipWitness: (referenceBlock: BlockParameter, nullifier: Fr) =>
      cache.fetch(`low-nullifier-membership-witness:${keyPart(referenceBlock)}:${nullifier.toString()}`, () =>
        node.getLowNullifierMembershipWitness(referenceBlock, nullifier),
      ),

    getPublicStorageAt: (referenceBlock: BlockParameter, contractAddress: AztecAddress, storageSlot: Fr) =>
      cache.fetch(
        `public-storage:${keyPart(referenceBlock)}:${contractAddress.toString()}:${storageSlot.toString()}`,
        () => node.getPublicStorageAt(referenceBlock, contractAddress, storageSlot),
      ),

    findLeavesIndexes: (referenceBlock: BlockParameter, treeId: MerkleTreeId, leafValues: Fr[]) => {
      const keys = leafValues.map(leaf => `leaf-index:${keyPart(referenceBlock)}:${treeId}:${leaf.toString()}`);
      const results = keys.map(key => cache.get(key));
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
      const cachedRead = cachedReads[prop];
      if (cachedRead) {
        return cachedRead;
      }
      const value = target[prop];
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

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
