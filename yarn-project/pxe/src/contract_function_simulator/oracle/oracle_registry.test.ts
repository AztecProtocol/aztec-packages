import { Fr } from '@aztec/foundation/curves/bn254';
import { FieldReader } from '@aztec/foundation/serialize';

import { BYTE, type TypeMapping, U32 } from './oracle_registry.js';

function deserialize<T>(mapping: TypeMapping<T>, value: Fr): T {
  const reader = new FieldReader([value]);
  return mapping.deserialization!.fn([reader]);
}

describe('oracle_registry type mappings', () => {
  describe('U32', () => {
    it('deserializes a valid u32', () => {
      expect(deserialize(U32, new Fr(42))).toBe(42);
    });

    it('deserializes u32 max', () => {
      expect(deserialize(U32, new Fr(0xffffffffn))).toBe(0xffffffff);
    });

    it('rejects values exceeding u32 max', () => {
      expect(() => deserialize(U32, new Fr(0x100000000n))).toThrow('U32 overflow');
    });
  });

  describe('BYTE', () => {
    it('deserializes a valid byte', () => {
      expect(deserialize(BYTE, new Fr(0))).toBe(0);
    });

    it('deserializes byte max', () => {
      expect(deserialize(BYTE, new Fr(255))).toBe(255);
    });

    it('rejects values exceeding u8 max', () => {
      expect(() => deserialize(BYTE, new Fr(256))).toThrow('BYTE overflow');
    });
  });
});
