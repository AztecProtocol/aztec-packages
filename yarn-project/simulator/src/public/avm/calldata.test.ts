import { Fr } from '@aztec/foundation/curves/bn254';

import { Field, TaggedMemory } from './avm_memory_types.js';
import { LazyReaderArray, LazyReaderMemory } from './calldata.js';

describe('LazyReader test suite', () => {
  describe('LazyReaderArray', () => {
    it('LazyReaderArray respects readCap in bestEffortReadAll', () => {
      const data = [new Fr(1), new Fr(2), new Fr(3), new Fr(4), new Fr(5)];
      const reader = new LazyReaderArray(data);
      expect(reader.bestEffortReadAll(3)).toEqual([new Fr(1), new Fr(2), new Fr(3)]);
    });
  });
  describe('LazyReaderMemory', () => {
    it('LazyReaderMemory respects readCap in bestEffortReadAll', () => {
      const memory = new TaggedMemory();
      memory.setSlice(10, [new Field(1n), new Field(2n), new Field(3n), new Field(4n), new Field(5n)]);
      const reader = new LazyReaderMemory(memory, 10, 5);
      expect(reader.bestEffortReadAll(3)).toEqual([new Fr(1), new Fr(2), new Fr(3)]);
    });

    it('LazyReaderMemory caps bestEffortReadAll at memory bounds', () => {
      const memory = new TaggedMemory();
      const nearEnd = TaggedMemory.MAX_MEMORY_SIZE - 2;
      memory.set(nearEnd, new Field(42n));
      memory.set(nearEnd + 1, new Field(43n));
      // Request size 100, but only 2 elements fit before MAX_MEMORY_SIZE
      const reader = new LazyReaderMemory(memory, nearEnd, 100);
      expect(reader.bestEffortReadAll()).toHaveLength(2);
    });

    it('LazyReaderMemory caps bestEffortReadAll at default cap (10000)', () => {
      const memory = new TaggedMemory();
      memory.set(0, new Field(1n));
      memory.set(14999, new Field(2n));
      const reader = new LazyReaderMemory(memory, 0, 15000);
      expect(reader.bestEffortReadAll()).toHaveLength(10000);
    });

    it('LazyReaderMemory slice applies offset correctly', () => {
      const memory = new TaggedMemory();
      // Data at memory positions 100-104
      memory.setSlice(100, [new Field(10n), new Field(20n), new Field(30n), new Field(40n), new Field(50n)]);
      const reader = new LazyReaderMemory(memory, 100, 5);
      // slice(1, 4) should read memory positions 101-103
      expect(reader.slice(1, 4)).toEqual([new Fr(20), new Fr(30), new Fr(40)]);
    });

    it('LazyReaderMemory slice trims result when end exceeds size', () => {
      const memory = new TaggedMemory();
      memory.setSlice(0, [new Field(1n), new Field(2n), new Field(3n), new Field(4n), new Field(5n)]);
      const reader = new LazyReaderMemory(memory, 0, 5);
      // Request slice(2, 10) but size is only 5, should return only elements 2-4
      expect(reader.slice(2, 10)).toEqual([new Fr(3), new Fr(4), new Fr(5)]);
    });

    it('LazyReaderMemory slice returns empty when start >= size', () => {
      const memory = new TaggedMemory();
      memory.setSlice(0, [new Field(1n), new Field(2n), new Field(3n)]);
      const reader = new LazyReaderMemory(memory, 0, 3);
      // Start beyond size should return empty, like array.slice(5, 10) on a 3-element array
      expect(reader.slice(5, 10)).toEqual([]);
    });

    it('LazyReaderMemory handles empty reader (size = 0)', () => {
      const memory = new TaggedMemory();
      memory.set(0, new Field(999n)); // Data exists but reader has size 0
      const reader = new LazyReaderMemory(memory, 0, 0);
      expect(reader.length()).toBe(0);
      expect(reader.readAll()).toEqual([]);
      expect(reader.bestEffortReadAll()).toEqual([]);
      expect(reader.slice(0, 5)).toEqual([]);
    });
  });
});
