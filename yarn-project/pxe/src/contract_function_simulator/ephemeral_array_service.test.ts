import { Fr } from '@aztec/foundation/curves/bn254';

import { EphemeralArrayService } from './ephemeral_array_service.js';

describe('EphemeralArrayService', () => {
  let service: EphemeralArrayService;
  const slot = Fr.fromString('0x01');
  const otherSlot = Fr.fromString('0x02');

  beforeEach(() => {
    service = new EphemeralArrayService();
  });

  describe('len', () => {
    it('returns 0 for uninitialized array', () => {
      expect(service.len(slot)).toBe(0);
    });
  });

  describe('push', () => {
    it('appends element and returns new length', () => {
      const newLen = service.push(slot, [new Fr(5), new Fr(6)]);
      expect(newLen).toBe(1);
      expect(service.len(slot)).toBe(1);
    });

    it('appends multiple elements', () => {
      service.push(slot, [new Fr(5)]);
      service.push(slot, [new Fr(6)]);
      expect(service.len(slot)).toBe(2);
    });
  });

  describe('get', () => {
    it('retrieves pushed element', () => {
      service.push(slot, [new Fr(5), new Fr(6)]);
      const result = service.get(slot, 0);
      expect(result).toEqual([new Fr(5), new Fr(6)]);
    });

    it('retrieves elements at different indices', () => {
      service.push(slot, [new Fr(1)]);
      service.push(slot, [new Fr(2)]);
      service.push(slot, [new Fr(3)]);
      expect(service.get(slot, 0)).toEqual([new Fr(1)]);
      expect(service.get(slot, 1)).toEqual([new Fr(2)]);
      expect(service.get(slot, 2)).toEqual([new Fr(3)]);
    });

    it('throws on out of bounds index', () => {
      expect(() => service.get(slot, 0)).toThrow('out of bounds');
    });

    it('throws on index equal to length', () => {
      service.push(slot, [new Fr(1)]);
      expect(() => service.get(slot, 1)).toThrow('out of bounds');
    });
  });

  describe('set', () => {
    it('overwrites element at index', () => {
      service.push(slot, [new Fr(1)]);
      service.set(slot, 0, [new Fr(99)]);
      expect(service.get(slot, 0)).toEqual([new Fr(99)]);
    });

    it('throws on out of bounds index', () => {
      expect(() => service.set(slot, 0, [new Fr(1)])).toThrow('out of bounds');
    });
  });

  describe('pop', () => {
    it('removes and returns last element', () => {
      service.push(slot, [new Fr(1)]);
      service.push(slot, [new Fr(2)]);
      const popped = service.pop(slot);
      expect(popped).toEqual([new Fr(2)]);
      expect(service.len(slot)).toBe(1);
    });

    it('throws on empty array', () => {
      expect(() => service.pop(slot)).toThrow('empty');
    });
  });

  describe('remove', () => {
    it('removes last element without shifting', () => {
      service.push(slot, [new Fr(1)]);
      service.push(slot, [new Fr(2)]);
      service.remove(slot, 1);
      expect(service.len(slot)).toBe(1);
      expect(service.get(slot, 0)).toEqual([new Fr(1)]);
    });

    it('removes middle element and shifts remaining', () => {
      service.push(slot, [new Fr(7)]);
      service.push(slot, [new Fr(8)]);
      service.push(slot, [new Fr(9)]);
      service.remove(slot, 1);
      expect(service.len(slot)).toBe(2);
      expect(service.get(slot, 0)).toEqual([new Fr(7)]);
      expect(service.get(slot, 1)).toEqual([new Fr(9)]);
    });

    it('removes first element and shifts all', () => {
      service.push(slot, [new Fr(7)]);
      service.push(slot, [new Fr(8)]);
      service.push(slot, [new Fr(9)]);
      service.remove(slot, 0);
      expect(service.len(slot)).toBe(2);
      expect(service.get(slot, 0)).toEqual([new Fr(8)]);
      expect(service.get(slot, 1)).toEqual([new Fr(9)]);
    });

    it('throws on out of bounds index', () => {
      expect(() => service.remove(slot, 0)).toThrow('out of bounds');
    });
  });

  describe('copy', () => {
    it('copies elements to a different slot', () => {
      service.push(slot, [new Fr(1)]);
      service.push(slot, [new Fr(2)]);
      service.push(slot, [new Fr(3)]);
      service.copy(slot, otherSlot, 3);
      expect(service.len(otherSlot)).toBe(3);
      expect(service.get(otherSlot, 0)).toEqual([new Fr(1)]);
      expect(service.get(otherSlot, 1)).toEqual([new Fr(2)]);
      expect(service.get(otherSlot, 2)).toEqual([new Fr(3)]);
    });

    it('copies partial elements', () => {
      service.push(slot, [new Fr(1)]);
      service.push(slot, [new Fr(2)]);
      service.push(slot, [new Fr(3)]);
      service.copy(slot, otherSlot, 2);
      expect(service.len(otherSlot)).toBe(2);
      expect(service.get(otherSlot, 0)).toEqual([new Fr(1)]);
      expect(service.get(otherSlot, 1)).toEqual([new Fr(2)]);
    });

    it('throws when count exceeds source length', () => {
      service.push(slot, [new Fr(1)]);
      expect(() => service.copy(slot, otherSlot, 2)).toThrow();
    });
  });

  describe('slot isolation', () => {
    it('different slots are independent', () => {
      service.push(slot, [new Fr(10)]);
      service.push(otherSlot, [new Fr(20)]);
      expect(service.len(slot)).toBe(1);
      expect(service.len(otherSlot)).toBe(1);
      expect(service.get(slot, 0)).toEqual([new Fr(10)]);
      expect(service.get(otherSlot, 0)).toEqual([new Fr(20)]);
    });
  });
});
