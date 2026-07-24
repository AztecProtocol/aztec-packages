import { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { BlockHash, BlockParameter } from '@aztec/stdlib/block';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import type { TxHash } from '@aztec/stdlib/tx';

/**
 * Per-execution cache for immutable Aztec node reads.
 */
export class AztecNodeReadCache {
  private readonly cache = new Map<string, Promise<unknown>>();

  constructor(private readonly aztecNode: AztecNode) {}

  /** Fetches a block without reissuing the same node request. */
  public getBlock(block: BlockParameter) {
    return this.#cachedRead(`block:${this.#keyPart(block)}`, () => this.aztecNode.getBlock(block));
  }

  /** Fetches a transaction receipt with its effect attached. */
  public getTxReceiptWithEffect(txHash: TxHash) {
    return this.#cachedRead(`tx-receipt-with-effect:${txHash.toString()}`, () =>
      this.aztecNode.getTxReceipt(txHash, { includeTxEffect: true } as const),
    );
  }

  /** Fetches an archive-tree witness for a block hash. */
  public getBlockHashMembershipWitness(referenceBlock: BlockParameter, blockHash: BlockHash) {
    return this.#cachedRead(
      `block-hash-membership-witness:${this.#keyPart(referenceBlock)}:${blockHash.toString()}`,
      () => this.aztecNode.getBlockHashMembershipWitness(referenceBlock, blockHash),
    );
  }

  /** Fetches a public-data-tree witness for a leaf slot. */
  public getPublicDataWitness(referenceBlock: BlockParameter, leafSlot: Fr) {
    return this.#cachedRead(`public-data-witness:${this.#keyPart(referenceBlock)}:${leafSlot.toString()}`, () =>
      this.aztecNode.getPublicDataWitness(referenceBlock, leafSlot),
    );
  }

  /** Fetches public storage for a single slot. */
  public getPublicStorageAt(referenceBlock: BlockParameter, contractAddress: AztecAddress, storageSlot: Fr) {
    return this.#cachedRead(
      `public-storage:${this.#keyPart(referenceBlock)}:${contractAddress.toString()}:${storageSlot.toString()}`,
      () => this.aztecNode.getPublicStorageAt(referenceBlock, contractAddress, storageSlot),
    );
  }

  /** Fetches a contiguous public storage range, reusing cached reads for overlapping slots. */
  public getPublicStorageRange(
    referenceBlock: BlockParameter,
    contractAddress: AztecAddress,
    startStorageSlot: Fr,
    numberOfElements: number,
  ) {
    const slots = Array(numberOfElements)
      .fill(0)
      .map((_, i) => new Fr(startStorageSlot.value + BigInt(i)));

    return Promise.all(slots.map(storageSlot => this.getPublicStorageAt(referenceBlock, contractAddress, storageSlot)));
  }

  #cachedRead<T>(key: string, fetch: () => Promise<T>): Promise<T> {
    const cached = this.cache.get(key);
    if (cached) {
      return cached as Promise<T>;
    }

    const promise = fetch();
    promise.catch(() => this.cache.delete(key));
    this.cache.set(key, promise);
    return promise;
  }

  #keyPart(value: unknown): string {
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
}
