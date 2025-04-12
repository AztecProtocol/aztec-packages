import { Fr } from '@aztec/foundation/fields';
import { toArray } from '@aztec/foundation/iterable';
import { type Logger, createLogger } from '@aztec/foundation/log';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

import type { DataProvider } from '../data_provider.js';

export class CapsuleDataProvider implements DataProvider {
  #store: AztecAsyncKVStore;

  // Arbitrary data stored by contracts. Key is computed as `${contractAddress}:${key}`
  #capsules: AztecAsyncMap<string, Buffer>;

  logger: Logger;

  constructor(store: AztecAsyncKVStore) {
    this.#store = store;

    this.#capsules = this.#store.openMap('capsules');

    this.logger = createLogger('pxe:capsule-data-provider');
  }

  async storeCapsule(contractAddress: AztecAddress, slot: Fr, capsule: Fr[]): Promise<void> {
    await this.#capsules.set(dbSlotToKey(contractAddress, slot), Buffer.concat(capsule.map(value => value.toBuffer())));
  }

  async loadCapsule(contractAddress: AztecAddress, slot: Fr): Promise<Fr[] | null> {
    const dataBuffer = await this.#capsules.getAsync(dbSlotToKey(contractAddress, slot));
    if (!dataBuffer) {
      this.logger.debug(`Data not found for contract ${contractAddress.toString()} and slot ${slot.toString()}`);
      return null;
    }
    const capsule: Fr[] = [];
    for (let i = 0; i < dataBuffer.length; i += Fr.SIZE_IN_BYTES) {
      capsule.push(Fr.fromBuffer(dataBuffer.subarray(i, i + Fr.SIZE_IN_BYTES)));
    }
    return capsule;
  }

  async deleteCapsule(contractAddress: AztecAddress, slot: Fr): Promise<void> {
    await this.#capsules.delete(dbSlotToKey(contractAddress, slot));
  }

  copyCapsule(contractAddress: AztecAddress, srcSlot: Fr, dstSlot: Fr, numEntries: number): Promise<void> {
    return this.#store.transactionAsync(async () => {
      // In order to support overlapping source and destination regions, we need to check the relative positions of source
      // and destination. If destination is ahead of source, then by the time we overwrite source elements using forward
      // indexes we'll have already read those. On the contrary, if source is ahead of destination we need to use backward
      // indexes to avoid reading elements that've been overwritten.

      const indexes = Array.from(Array(numEntries).keys());
      if (srcSlot.lt(dstSlot)) {
        indexes.reverse();
      }

      for (const i of indexes) {
        const currentSrcSlot = dbSlotToKey(contractAddress, srcSlot.add(new Fr(i)));
        const currentDstSlot = dbSlotToKey(contractAddress, dstSlot.add(new Fr(i)));

        const toCopy = await this.#capsules.getAsync(currentSrcSlot);
        if (!toCopy) {
          throw new Error(`Attempted to copy empty slot ${currentSrcSlot} for contract ${contractAddress.toString()}`);
        }

        await this.#capsules.set(currentDstSlot, toCopy);
      }
    });
  }

  /**
   * Appends multiple capsules to a capsule array stored at the base slot.
   * The array length is stored at the base slot, and elements are stored in consecutive slots after it.
   * All operations are performed in a single transaction.
   * @param contractAddress - The contract address that owns the capsule array
   * @param baseSlot - The slot where the array length is stored
   * @param capsules - Array of capsule data to append
   */
  appendToCapsuleArray(contractAddress: AztecAddress, baseSlot: Fr, capsules: Fr[][]): Promise<void> {
    return this.#store.transactionAsync(async () => {
      // Load current length, defaulting to 0 if not found
      const lengthData = await this.loadCapsule(contractAddress, baseSlot);
      const currentLength = lengthData ? lengthData[0].toBigInt() : 0n;

      // Store each capsule at consecutive slots after baseSlot + 1 + currentLength
      for (let i = 0; i < capsules.length; i++) {
        const nextSlot = baseSlot.add(new Fr(1)).add(new Fr(currentLength + BigInt(i)));
        await this.storeCapsule(contractAddress, nextSlot, capsules[i]);
      }

      // Update length to include all new capsules
      const newLength = currentLength + BigInt(capsules.length);
      await this.storeCapsule(contractAddress, baseSlot, [new Fr(newLength)]);
    });
  }

  public async getSize() {
    return (await toArray(this.#capsules.valuesAsync())).reduce(
      (sum, value) => sum + value.length * Fr.SIZE_IN_BYTES,
      0,
    );
  }
}

function dbSlotToKey(contractAddress: AztecAddress, slot: Fr): string {
  return `${contractAddress.toString()}:${slot.toString()}`;
}
