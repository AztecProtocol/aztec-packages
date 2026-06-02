import { Fr } from '@aztec/foundation/curves/bn254';
import { FieldReader } from '@aztec/foundation/serialize';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { Tag } from '@aztec/stdlib/logs';

import { EphemeralArrayService } from '../ephemeral_array_service.js';
import { LogRetrievalRequest } from '../noir-structs/log_retrieval_request.js';
import {
  BOUNDED_VEC,
  BYTE,
  EPHEMERAL_ARRAY,
  FIELD,
  LOG_RETRIEVAL_REQUEST,
  type TypeMapping,
  U32,
} from './oracle_registry.js';

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

  describe('BOUNDED_VEC', () => {
    it('deserializes when capacity equals length', () => {
      const a = Fr.random();
      const b = Fr.random();
      const bv = deserializeBoundedVec(FIELD, [a, b], 2);
      expect(bv.data).toEqual([a, b]);
      expect(bv.maxLength).toBe(2);
    });

    it('deserializes when capacity exceeds length', () => {
      const a = Fr.random();
      const bv = deserializeBoundedVec(FIELD, [a], 4);
      expect(bv.data).toEqual([a]);
      expect(bv.maxLength).toBe(4);
    });

    it('deserializes an empty vec with nonzero capacity', () => {
      const bv = deserializeBoundedVec(FIELD, [], 3);
      expect(bv.data).toEqual([]);
      expect(bv.maxLength).toBe(3);
    });
  });

  describe('EPHEMERAL_ARRAY', () => {
    it('deserializes well-formed rows', () => {
      const a = Fr.random();
      const b = Fr.random();
      expect(readEphemeralArray(FIELD, [[a], [b]])).toEqual([a, b]);
    });

    it('rejects a row with too few fields', () => {
      expect(() => readEphemeralArray(FIELD, [[]])).toThrow('Not enough fields to be consumed.');
    });

    it('rejects a row with trailing fields', () => {
      expect(() => readEphemeralArray(FIELD, [[Fr.random(), Fr.random()]])).toThrow('unexpected trailing field(s)');
    });

    it('rejects a multi-field row with trailing fields', async () => {
      const row = new LogRetrievalRequest(await AztecAddress.random(), new Tag(Fr.random())).toFields();
      expect(() => readEphemeralArray(LOG_RETRIEVAL_REQUEST, [[...row, Fr.random()]])).toThrow(
        'unexpected trailing field(s)',
      );
    });
  });
});

/** Deserializes a BoundedVec from `data` (padded to `capacity` with Fr.ZERO) and a length field. */
function deserializeBoundedVec<T>(element: TypeMapping<T>, data: Fr[], capacity: number) {
  const padded = [...data, ...Array(capacity - data.length).fill(Fr.ZERO)];
  const storageReader = new FieldReader(padded);
  const lengthReader = new FieldReader([new Fr(data.length)]);
  return BOUNDED_VEC(element).deserialization!.fn([storageReader, lengthReader]);
}

/** Reads an input-mode EphemeralArray backed by `rows`, the way the registry does when deserializing an oracle param. */
function readEphemeralArray<T>(element: TypeMapping<T>, rows: Fr[][]): T[] {
  const service = new EphemeralArrayService();
  const slot = service.newArray(rows);
  const array = EPHEMERAL_ARRAY(element).deserialization!.fn([new FieldReader([slot])]);
  return array.readAll(service);
}
