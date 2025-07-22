import { BitVector } from './bitvector.js';

describe('BitVector', () => {
  describe('BitVector operations', () => {
    it('should handle empty indices array', () => {
      const bitVector = BitVector.init(8, []);
      expect(bitVector.getLength()).toBe(8);
      for (let i = 0; i < 8; i++) {
        expect(bitVector.isSet(i)).toBe(false);
      }
    });

    it('should create BitVector from indices correctly', () => {
      // Set up a BitVector of length 8 with bits set at indices 0, 2, 4, and 6
      const bitVector = BitVector.init(8, [0, 2, 4, 6]);
      expect(bitVector.getLength()).toBe(8);

      for (let i = 0; i < 8; i++) {
        expect(bitVector.isSet(i)).toBe(i % 2 === 0); // Even indices should be set
      }
    });

    it('should handle partial bytes correctly', () => {
      const bitVector = BitVector.init(10, [1, 3, 9]);
      expect(bitVector.getLength()).toBe(10);
      expect(bitVector.isSet(1)).toBe(true);
      expect(bitVector.isSet(3)).toBe(true);
      expect(bitVector.isSet(9)).toBe(true);
      expect(bitVector.isSet(0)).toBe(false);
      expect(bitVector.isSet(8)).toBe(false);
    });

    it('should handle single bit', () => {
      const bitVector = BitVector.init(1, [0]);
      expect(bitVector.getLength()).toBe(1);
      expect(bitVector.isSet(0)).toBe(true);
    });

    it('should return all true indices in order', () => {
      const indices = [1, 3, 5, 7, 10];
      const bitVector = BitVector.init(12, indices);
      expect(bitVector.getTrueIndices()).toEqual(indices);
    });

    it('should serialize and deserialize correctly', () => {
      const trueIndices = [0, 3, 7, 12, 15];
      const original = BitVector.init(16, trueIndices);
      const buffer = original.toBuffer();
      const deserialized = BitVector.fromBuffer(buffer);

      expect(deserialized.getLength()).toBe(original.getLength());
      expect(deserialized.getTrueIndices()).toEqual(trueIndices);
    });

    it('should handle empty BitVector serialization', () => {
      const original = BitVector.init(0, []);
      const buffer = original.toBuffer();
      const deserialized = BitVector.fromBuffer(buffer);

      expect(deserialized.getLength()).toBe(0);
      expect(deserialized.getTrueIndices()).toEqual([]);
    });
  });

  describe('error cases', () => {
    it('should throw when indices length exceeds total length', () => {
      expect(() => BitVector.init(3, [0, 1, 2, 3])).toThrow('Indices length exceeds specified length');
    });

    it('should throw when index is negative', () => {
      expect(() => BitVector.init(8, [-1])).toThrow('Index -1 is out of bounds for BitVector of length 8');
    });

    it('should throw when index is out of bounds', () => {
      expect(() => BitVector.init(8, [8])).toThrow('Index 8 is out of bounds for BitVector of length 8');
    });

    it('should return false for out of bounds indices', () => {
      const bitVector = BitVector.init(8, [2, 5]);
      expect(bitVector.isSet(-1)).toBe(false);
      expect(bitVector.isSet(8)).toBe(false);
      expect(bitVector.isSet(100)).toBe(false);
    });
  });
});
