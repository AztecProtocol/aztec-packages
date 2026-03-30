import { Fr } from '@aztec/foundation/curves/bn254';

/** In-memory array service for transient data during a single contract call frame. */
export class VolatileArrayService {
  /** Maps base slot to array of elements, where each element is a serialized Fr[]. */
  #arrays: Map<string, Fr[][]> = new Map();

  #getArray(baseSlot: Fr): Fr[][] {
    return this.#arrays.get(baseSlot.toString()) ?? [];
  }

  #setArray(baseSlot: Fr, array: Fr[][]): void {
    this.#arrays.set(baseSlot.toString(), array);
  }

  /** Returns the number of elements in the array at the given slot. */
  len(baseSlot: Fr): number {
    return this.#getArray(baseSlot).length;
  }

  /** Appends an element to the array and returns the new length. */
  push(baseSlot: Fr, elements: Fr[]): number {
    const array = this.#getArray(baseSlot);
    array.push(elements);
    this.#setArray(baseSlot, array);
    return array.length;
  }

  /** Removes and returns the last element. Throws if empty. */
  pop(baseSlot: Fr): Fr[] {
    const array = this.#getArray(baseSlot);
    if (array.length === 0) {
      throw new Error(`Volatile array at slot ${baseSlot} is empty`);
    }
    const element = array.pop()!;
    this.#setArray(baseSlot, array);
    return element;
  }

  /** Returns the element at the given index. Throws if out of bounds. */
  get(baseSlot: Fr, index: number): Fr[] {
    const array = this.#getArray(baseSlot);
    if (index < 0 || index >= array.length) {
      throw new Error(
        `Volatile array index ${index} out of bounds for array of length ${array.length} at slot ${baseSlot}`,
      );
    }
    return array[index];
  }

  /** Overwrites the element at the given index. Throws if out of bounds. */
  set(baseSlot: Fr, index: number, value: Fr[]): void {
    const array = this.#getArray(baseSlot);
    if (index < 0 || index >= array.length) {
      throw new Error(
        `Volatile array index ${index} out of bounds for array of length ${array.length} at slot ${baseSlot}`,
      );
    }
    array[index] = value;
  }

  /** Removes the element at the given index, shifting subsequent elements backward. Throws if out of bounds. */
  remove(baseSlot: Fr, index: number): void {
    const array = this.#getArray(baseSlot);
    if (index < 0 || index >= array.length) {
      throw new Error(
        `Volatile array index ${index} out of bounds for array of length ${array.length} at slot ${baseSlot}`,
      );
    }
    array.splice(index, 1);
  }

  /** Allocates a fresh, unused base slot for a new volatile array. */
  allocateSlot(): Fr {
    let slot: Fr;
    do {
      slot = Fr.random();
    } while (this.#arrays.has(slot.toString()));
    return slot;
  }

  /** Creates a new volatile array pre-populated with the given elements and returns its base slot. */
  newArray(elements: Fr[][]): Fr {
    const slot = this.allocateSlot();
    this.#setArray(slot, elements);
    return slot;
  }

  /** Copies `count` elements from the source array to the destination array (overwrites destination). */
  copy(srcSlot: Fr, dstSlot: Fr, count: number): void {
    const srcArray = this.#getArray(srcSlot);
    if (count > srcArray.length) {
      throw new Error(
        `Cannot copy ${count} elements from volatile array of length ${srcArray.length} at slot ${srcSlot}`,
      );
    }
    // Deep copy the elements to avoid aliasing
    const copied = srcArray.slice(0, count).map(el => [...el]);
    this.#setArray(dstSlot, copied);
  }
}
