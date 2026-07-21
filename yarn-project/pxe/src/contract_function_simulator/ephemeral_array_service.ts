import { Fr } from '@aztec/foundation/curves/bn254';

/** In-memory store for ephemeral arrays scoped to a single contract call frame. */
export class EphemeralArrayService {
  /**
   * Maps a slot to the elements of the array stored at that slot. Each element is a serialized representation of
   * the original type.
   */
  #arrays: Map<string, Fr[][]> = new Map();

  /** Returns all elements in the array, or an empty array if uninitialized. */
  readArrayAt(slot: Fr): Fr[][] {
    return this.#arrays.get(slot.toString()) ?? [];
  }

  #setArray(slot: Fr, array: Fr[][]): void {
    this.#arrays.set(slot.toString(), array);
  }

  /** Returns the number of elements in the array at the given slot. */
  len(slot: Fr): number {
    return this.readArrayAt(slot).length;
  }

  /** Appends an element to the array and returns the new length. */
  push(slot: Fr, elements: Fr[]): number {
    const array = this.readArrayAt(slot);
    array.push(elements);
    this.#setArray(slot, array);
    return array.length;
  }

  /** Removes and returns the last element. Throws if empty. */
  pop(slot: Fr): Fr[] {
    const array = this.readArrayAt(slot);
    if (array.length === 0) {
      throw new Error(`Ephemeral array at slot ${slot} is empty`);
    }
    const element = array.pop()!;
    this.#setArray(slot, array);
    return element;
  }

  /** Returns the element at the given index. Throws if out of bounds. */
  get(slot: Fr, index: number): Fr[] {
    const array = this.readArrayAt(slot);
    if (index < 0 || index >= array.length) {
      throw new Error(
        `Ephemeral array index ${index} out of bounds for array of length ${array.length} at slot ${slot}`,
      );
    }
    return array[index];
  }

  /** Overwrites the element at the given index. Throws if out of bounds. */
  set(slot: Fr, index: number, value: Fr[]): void {
    const array = this.readArrayAt(slot);
    if (index < 0 || index >= array.length) {
      throw new Error(
        `Ephemeral array index ${index} out of bounds for array of length ${array.length} at slot ${slot}`,
      );
    }
    array[index] = value;
  }

  /** Removes the element at the given index, shifting subsequent elements backward. Throws if out of bounds. */
  remove(slot: Fr, index: number): void {
    const array = this.readArrayAt(slot);
    if (index < 0 || index >= array.length) {
      throw new Error(
        `Ephemeral array index ${index} out of bounds for array of length ${array.length} at slot ${slot}`,
      );
    }
    array.splice(index, 1);
  }

  /** Removes all elements from the array. */
  clear(slot: Fr): void {
    this.#arrays.delete(slot.toString());
  }

  /** Allocates a fresh, unused slot for a new ephemeral array. */
  allocateSlot(): Fr {
    let slot: Fr;
    do {
      slot = Fr.random();
    } while (this.#arrays.has(slot.toString()));
    return slot;
  }

  /** Creates a new ephemeral array pre-populated with the given elements and returns its slot. */
  newArray(elements: Fr[][]): Fr {
    const slot = this.allocateSlot();
    this.#setArray(slot, elements);
    return slot;
  }

  /** Copies `count` elements from the source array to the destination array (overwrites destination). */
  copy(srcSlot: Fr, dstSlot: Fr, count: number): void {
    const srcArray = this.readArrayAt(srcSlot);
    if (count > srcArray.length) {
      throw new Error(
        `Cannot copy ${count} elements from ephemeral array of length ${srcArray.length} at slot ${srcSlot}`,
      );
    }
    // Deep copy the elements to avoid aliasing
    const copied = srcArray.slice(0, count).map(el => [...el]);
    this.#setArray(dstSlot, copied);
  }
}
