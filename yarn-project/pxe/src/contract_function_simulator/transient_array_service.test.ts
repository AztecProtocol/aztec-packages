import { Fr } from '@aztec/foundation/curves/bn254';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { TransientArrayService } from './transient_array_service.js';

describe('TransientArrayService', () => {
  let service: TransientArrayService;
  const contractA = AztecAddress.fromFieldUnsafe(new Fr(0xaa));
  const contractB = AztecAddress.fromFieldUnsafe(new Fr(0xbb));
  const slot = Fr.fromString('0x01');
  const otherSlot = Fr.fromString('0x02');

  beforeEach(() => {
    service = new TransientArrayService();
  });

  it('returns 0 for an uninitialized array', () => {
    expect(service.len(contractA, slot)).toBe(0);
  });

  it('pushes, reads, and reports length', () => {
    expect(service.push(contractA, slot, [new Fr(5), new Fr(6)])).toBe(1);
    expect(service.len(contractA, slot)).toBe(1);
    expect(service.get(contractA, slot, 0)).toEqual([new Fr(5), new Fr(6)]);
  });

  it('pops the last element and throws when empty', () => {
    service.push(contractA, slot, [new Fr(1)]);
    service.push(contractA, slot, [new Fr(2)]);
    expect(service.pop(contractA, slot)).toEqual([new Fr(2)]);
    expect(service.len(contractA, slot)).toBe(1);
    service.pop(contractA, slot);
    expect(() => service.pop(contractA, slot)).toThrow('empty');
  });

  it('overwrites with set and validates bounds on get/set/remove', () => {
    service.push(contractA, slot, [new Fr(1)]);
    service.set(contractA, slot, 0, [new Fr(99)]);
    expect(service.get(contractA, slot, 0)).toEqual([new Fr(99)]);
    expect(() => service.get(contractA, slot, 1)).toThrow('out of bounds');
    expect(() => service.set(contractA, slot, 1, [new Fr(0)])).toThrow('out of bounds');
    expect(() => service.remove(contractA, slot, 1)).toThrow('out of bounds');
  });

  it('removes a middle element and shifts the remainder', () => {
    service.push(contractA, slot, [new Fr(7)]);
    service.push(contractA, slot, [new Fr(8)]);
    service.push(contractA, slot, [new Fr(9)]);
    service.remove(contractA, slot, 1);
    expect(service.len(contractA, slot)).toBe(2);
    expect(service.get(contractA, slot, 0)).toEqual([new Fr(7)]);
    expect(service.get(contractA, slot, 1)).toEqual([new Fr(9)]);
  });

  it('clears an array', () => {
    service.push(contractA, slot, [new Fr(1)]);
    service.clear(contractA, slot);
    expect(service.len(contractA, slot)).toBe(0);
  });

  it('isolates the same slot across different contracts', () => {
    service.push(contractA, slot, [new Fr(10)]);
    service.push(contractB, slot, [new Fr(20)]);
    expect(service.len(contractA, slot)).toBe(1);
    expect(service.len(contractB, slot)).toBe(1);
    expect(service.get(contractA, slot, 0)).toEqual([new Fr(10)]);
    expect(service.get(contractB, slot, 0)).toEqual([new Fr(20)]);
  });

  it('isolates different slots within the same contract', () => {
    service.push(contractA, slot, [new Fr(10)]);
    service.push(contractA, otherSlot, [new Fr(20)]);
    expect(service.get(contractA, slot, 0)).toEqual([new Fr(10)]);
    expect(service.get(contractA, otherSlot, 0)).toEqual([new Fr(20)]);
  });
});
