import { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

/**
 * In-memory store for transient arrays.
 *
 * Unlike {@link EphemeralArrayService} (one instance per call frame), a single `TransientArrayService` instance is shared
 * across all frames of one top-level PXE call (a transaction simulation or utility call), so arrays survive across nested
 * private and utility calls. Entries are keyed by `(contract address, slot)`; the contract address is supplied by the
 * oracle from its execution context, so a contract can only ever name its own arrays. The store is purely in-memory and
 * is discarded when the top-level PXE call completes — it is never persisted.
 */
export class TransientArrayService {
  /** Maps a `(contract address, slot)` key to the serialized elements stored there. */
  #arrays: Map<string, Fr[][]> = new Map();

  #key(contractAddress: AztecAddress, slot: Fr): string {
    return `${contractAddress.toString()}:${slot.toString()}`;
  }

  /** Returns all elements at the given key, or an empty array if uninitialized. */
  readArrayAt(contractAddress: AztecAddress, slot: Fr): Fr[][] {
    return this.#arrays.get(this.#key(contractAddress, slot)) ?? [];
  }

  #setArray(contractAddress: AztecAddress, slot: Fr, array: Fr[][]): void {
    this.#arrays.set(this.#key(contractAddress, slot), array);
  }

  /** Returns the number of elements stored at the given key. */
  len(contractAddress: AztecAddress, slot: Fr): number {
    return this.readArrayAt(contractAddress, slot).length;
  }

  /** Appends an element and returns the new length. */
  push(contractAddress: AztecAddress, slot: Fr, elements: Fr[]): number {
    const array = this.readArrayAt(contractAddress, slot);
    array.push(elements);
    this.#setArray(contractAddress, slot, array);
    return array.length;
  }

  /** Removes and returns the last element. Throws if empty. */
  pop(contractAddress: AztecAddress, slot: Fr): Fr[] {
    const array = this.readArrayAt(contractAddress, slot);
    if (array.length === 0) {
      throw new Error(`Transient array at slot ${slot} is empty`);
    }
    const element = array.pop()!;
    this.#setArray(contractAddress, slot, array);
    return element;
  }

  /** Returns the element at the given index. Throws if out of bounds. */
  get(contractAddress: AztecAddress, slot: Fr, index: number): Fr[] {
    const array = this.readArrayAt(contractAddress, slot);
    if (index < 0 || index >= array.length) {
      throw new Error(
        `Transient array index ${index} out of bounds for array of length ${array.length} at slot ${slot}`,
      );
    }
    return array[index];
  }

  /** Overwrites the element at the given index. Throws if out of bounds. */
  set(contractAddress: AztecAddress, slot: Fr, index: number, value: Fr[]): void {
    const array = this.readArrayAt(contractAddress, slot);
    if (index < 0 || index >= array.length) {
      throw new Error(
        `Transient array index ${index} out of bounds for array of length ${array.length} at slot ${slot}`,
      );
    }
    array[index] = value;
  }

  /** Removes the element at the given index, shifting subsequent elements backward. Throws if out of bounds. */
  remove(contractAddress: AztecAddress, slot: Fr, index: number): void {
    const array = this.readArrayAt(contractAddress, slot);
    if (index < 0 || index >= array.length) {
      throw new Error(
        `Transient array index ${index} out of bounds for array of length ${array.length} at slot ${slot}`,
      );
    }
    array.splice(index, 1);
  }

  /** Removes all elements at the given key. */
  clear(contractAddress: AztecAddress, slot: Fr): void {
    this.#arrays.delete(this.#key(contractAddress, slot));
  }
}
