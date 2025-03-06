import { Fr } from '@aztec/foundation/fields';
import { toArray } from '@aztec/foundation/iterable';
import { type LogFn, createDebugOnlyLogger } from '@aztec/foundation/log';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

import type { DataProvider } from '../data_provider.js';

export class CapsuleDataProvider implements DataProvider {
  #store: AztecAsyncKVStore;

  // Arbitrary data stored by contracts. Key is computed as `${contractAddress}:${key}`
  #capsules: AztecAsyncMap<string, Buffer>;

  debug: LogFn;

  constructor(store: AztecAsyncKVStore) {
    this.#store = store;

    this.#capsules = this.#store.openMap('capsules');

    this.debug = createDebugOnlyLogger('pxe:capsule-data-provider');
  }

  async storeCapsule(contractAddress: AztecAddress, slot: Fr, capsule: Fr[]): Promise<void> {
    await this.#capsules.set(dbSlotToKey(contractAddress, slot), Buffer.concat(capsule.map(value => value.toBuffer())));
  }

  async loadCapsule(contractAddress: AztecAddress, slot: Fr): Promise<Fr[] | null> {
    const dataBuffer = await this.#capsules.getAsync(dbSlotToKey(contractAddress, slot));
    if (!dataBuffer) {
      this.debug(`Data not found for contract ${contractAddress.toString()} and slot ${slot.toString()}`);
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

  async copyCapsule(contractAddress: AztecAddress, srcSlot: Fr, dstSlot: Fr, numEntries: number): Promise<void> {
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
