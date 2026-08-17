import { Fr } from '@aztec/foundation/curves/bn254';
import { FieldReader } from '@aztec/foundation/serialize';
import { MembershipWitness } from '@aztec/foundation/trees';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { AppTaggingSecretKind, Tag } from '@aztec/stdlib/logs';

import { EphemeralArrayService } from '../ephemeral_array_service.js';
import { BoundedVec } from '../noir-structs/bounded_vec.js';
import { type LogRetrievalRequest, LogSource } from '../noir-structs/log_retrieval_request.js';
import { Option } from '../noir-structs/option.js';
import type { ResolvedTaggingStrategy } from '../noir-structs/resolved_tagging_strategy.js';
import {
  ARRAY,
  AZTEC_ADDRESS,
  BOUNDED_VEC,
  DELIVERY_MODE,
  EPHEMERAL_ARRAY,
  FIELD,
  LOG_RETRIEVAL_REQUEST,
  MEMBERSHIP_WITNESS,
  OPTION,
  POINT,
  RESOLVED_TAGGING_STRATEGY,
  type SlotShape,
  type TypeMapping,
  U8,
  U32,
  makeEntry,
  slotsOf,
} from './oracle_registry.js';
import { FIXED_ARRAY, FIXED_BOUNDED_VEC, LEAF, SCALAR, STRUCT, TX_HASH, VECTOR } from './oracle_type_mappings.js';

/**
 * Tests for the oracle type mappings: how the PXE encodes values to, and decodes them from, the flat field arrays that
 * Noir oracles exchange over the ACVM foreign-call interface.
 *
 * A mapping's wire form is a list of *slots*. Each slot is either a single field (a scalar) or a run of fields (e.g. an
 * array's contents). `serialization.fn` produces the slots; `deserialization.fn` reads them back, one `FieldReader` per
 * slot. A mapping's `shape` declares each slot's width up front, so the reader knows where one slot ends and the next
 * begins.
 *
 * Most tests *round-trip*: serialize a value, deserialize the result, and assert it comes back unchanged (see the
 * `roundTrip` helper at the bottom). The rest pin a specific encoding, or check that malformed wire input is rejected.
 */
describe('oracle type mappings', () => {
  describe('FIELD', () => {
    it('serializes to its declared shape', () => {
      expect(shapeOf(FIELD.serialization!.fn(Fr.random()))).toEqual(FIELD.shape);
    });

    it('reads one input slot', () => {
      expect(slotsOf(FIELD)).toBe(1);
    });
  });

  describe('U32', () => {
    it('deserializes a value in range', () => {
      expect(deserialize(U32, new Fr(42))).toBe(42);
    });

    it('deserializes the maximum value', () => {
      expect(deserialize(U32, new Fr(0xffffffffn))).toBe(0xffffffff);
    });

    it('rejects a value above the maximum', () => {
      expect(() => deserialize(U32, new Fr(0x100000000n))).toThrow('u32 overflow');
    });
  });

  describe('U8', () => {
    it('deserializes a value in range', () => {
      expect(deserialize(U8, new Fr(0))).toBe(0);
    });

    it('deserializes the maximum value', () => {
      expect(deserialize(U8, new Fr(255))).toBe(255);
    });

    it('rejects a value above the maximum', () => {
      expect(() => deserialize(U8, new Fr(256))).toThrow('u8 overflow');
    });
  });

  // DELIVERY_MODE maps Noir's on-chain MessageDelivery variants (2 = unconstrained, 3 = constrained) to a tagging kind,
  // and rejects any other value.
  describe('DELIVERY_MODE', () => {
    it('deserializes unconstrained delivery as unconstrained tagging', () => {
      expect(deserialize(DELIVERY_MODE, new Fr(2))).toBe(AppTaggingSecretKind.UNCONSTRAINED);
    });

    it('deserializes constrained delivery as constrained tagging', () => {
      expect(deserialize(DELIVERY_MODE, new Fr(3))).toBe(AppTaggingSecretKind.CONSTRAINED);
    });

    it('rejects an invalid value', () => {
      expect(() => deserialize(DELIVERY_MODE, new Fr(1))).toThrow('Unrecognized delivery mode for tagging');
    });
  });

  describe('RESOLVED_TAGGING_STRATEGY', () => {
    const secret = new Fr(42);

    it('rejects an unknown strategy kind', () => {
      expect(() => deserializeStrategy(new Fr(99), Fr.ZERO)).toThrow('Unrecognized resolved tagging strategy kind');
    });

    it.each([
      ['non-interactive handshake', new Fr(1)],
      ['interactive handshake', new Fr(3)],
    ])('rejects %s with a nonzero secret', (_name, kind) => {
      expect(() => deserializeStrategy(kind, secret)).toThrow(`Resolved tagging strategy ${kind.toNumber()}`);
    });

    function deserializeStrategy(kind: Fr, secret: Fr): ResolvedTaggingStrategy {
      return RESOLVED_TAGGING_STRATEGY.deserialization!.fn([new FieldReader([kind]), new FieldReader([secret])]);
    }
  });

  describe('AZTEC_ADDRESS', () => {
    it('serializes to its declared shape', async () => {
      expect(shapeOf(AZTEC_ADDRESS.serialization!.fn(await AztecAddress.random()))).toEqual(AZTEC_ADDRESS.shape);
    });
  });

  // An Option serializes to a leading discriminant slot followed by the inner's slots.
  describe('OPTION', () => {
    it('round-trips a Some', () => {
      const value = Fr.random();
      const out = roundTrip(OPTION(FIELD), Option.some(value));
      expect(out.isSome()).toBe(true);
      expect(out.value).toEqual(value);
    });

    it('round-trips a None, skipping the inner instead of parsing it', () => {
      // A None still occupies the inner's slots as zero padding. REJECTS_ZERO_FIELD_TYPE throws on a zero, so a None
      // whose inner were parsed would throw here; the test passing proves the inner was skipped.
      const out = roundTrip(OPTION(REJECTS_ZERO_FIELD_TYPE), Option.none<Fr>());
      expect(out.isNone()).toBe(true);
    });

    it('serializes a fixed None as zero-padding', () => {
      // A None occupies the same slots as a Some, zero-filled. Here: [discriminant, the FIELD slot zeroed].
      expect(OPTION(FIELD).serialization!.fn(Option.none())).toEqual([Fr.ZERO, Fr.ZERO]);
    });

    it('serializes a variable None from its size descriptor', () => {
      // A variable inner (array, bounded vec) has no fixed width, so the None's size comes from the descriptor passed
      // to Option.none: { length } for an array, { maxLength } for a bounded vec.
      expect(OPTION(ARRAY(FIELD)).serialization!.fn(Option.none<Fr[]>({ length: 3 }))).toEqual([
        Fr.ZERO,
        [Fr.ZERO, Fr.ZERO, Fr.ZERO],
      ]);
      expect(OPTION(BOUNDED_VEC(U8)).serialization!.fn(Option.none<BoundedVec<number>>({ maxLength: 2 }))).toEqual([
        Fr.ZERO,
        [Fr.ZERO, Fr.ZERO],
        Fr.ZERO,
      ]);
    });

    it('rejects a variable None with no size descriptor', () => {
      expect(() => OPTION(ARRAY(FIELD)).serialization!.fn(Option.none())).toThrow('needs a size');
    });

    it('reads two input slots', () => {
      expect(slotsOf(OPTION(AZTEC_ADDRESS))).toBe(2); // discriminant + inner
    });
  });

  // A BoundedVec serializes to two slots: the element storage (padded to maxLength), then the actual length.
  // E.g. BoundedVec.from({ data: [0x41, 0x42], maxLength: 4 }) → storage [0x41, 0x42, 0, 0], length 2.
  describe('BOUNDED_VEC', () => {
    it('round-trips a full vec', () => {
      const data = [Fr.random(), Fr.random()];
      const out = roundTrip(BOUNDED_VEC(FIELD), BoundedVec.from({ data, maxLength: 2 }));
      expect(out.data).toEqual(data);
      expect(out.maxLength).toBe(2);
    });

    it('round-trips a partially-full vec', () => {
      const data = [Fr.random()];
      const out = roundTrip(BOUNDED_VEC(FIELD), BoundedVec.from({ data, maxLength: 4 }));
      expect(out.data).toEqual(data);
      expect(out.maxLength).toBe(4);
    });

    it('round-trips an empty vec', () => {
      const out = roundTrip(BOUNDED_VEC(FIELD), BoundedVec.from({ data: [], maxLength: 3 }));
      expect(out.data).toEqual([]);
      expect(out.maxLength).toBe(3);
    });

    it('round-trips a vec of multi-field elements', () => {
      const data = [
        { x: Fr.random(), y: Fr.random() },
        { x: Fr.random(), y: Fr.random() },
      ];
      const out = roundTrip(BOUNDED_VEC(POINT), BoundedVec.from({ data, maxLength: 3 }));
      expect(out.data).toEqual(data);
      expect(out.maxLength).toBe(3);
    });

    it('round-trips a vec of multi-slot elements', () => {
      const present = Fr.random();
      const data = [Option.some(present), Option.none<Fr>()];
      const vec = BoundedVec.from({ data, maxLength: 3 });
      const out = roundTrip(BOUNDED_VEC(OPTION(FIELD)), vec);
      expect(out.data.map(o => o.isSome())).toEqual([true, false]);
      expect(out.data[0].value).toEqual(present);
      expect(out.maxLength).toBe(3);
    });

    it('fully consumes a partially-full vec as an oracle param', () => {
      // The registry rejects a param whose slots aren't fully read. A partially-full vec leaves zero padding in its
      // storage slot, so this checks the deserializer drains that padding instead of tripping the consumption check.
      const entry = makeEntry({ params: [{ name: 'ciphertext', type: BOUNDED_VEC(U8) }] });
      const inputs = toInputSlots(BOUNDED_VEC(U8).serialization!.fn(BoundedVec.from({ data: [1, 2], maxLength: 4 })));
      const [{ value }] = entry.deserializeParams(inputs);
      expect(value.data).toEqual([1, 2]);
      expect(value.maxLength).toBe(4);
    });

    it('rejects an element that under-reads its slot', () => {
      const storage = new FieldReader([new Fr(1), new Fr(2)]);
      const length = new FieldReader([new Fr(1)]);
      expect(() => BOUNDED_VEC(UNDER_READS_SLOT_TYPE).deserialization!.fn([storage, length])).toThrow(
        'unexpected trailing field(s)',
      );
    });

    it('rejects a length beyond the storage array capacity', () => {
      const storage = new FieldReader([new Fr(1), new Fr(2)]);
      const length = new FieldReader([new Fr(3)]);
      expect(() => BOUNDED_VEC(FIELD).deserialization!.fn([storage, length])).toThrow(
        'length 3 exceeds the 2 element(s) its storage array holds',
      );
    });

    it('rejects a storage array that is not a whole number of elements', () => {
      const storage = new FieldReader([new Fr(1), new Fr(2), new Fr(3)]);
      const length = new FieldReader([new Fr(1)]);
      expect(() => BOUNDED_VEC(POINT).deserialization!.fn([storage, length])).toThrow(
        'storage array holds 3 field(s), which is not a whole number of 2-field elements',
      );
    });

    it('reads two input slots', () => {
      expect(slotsOf(BOUNDED_VEC(FIELD))).toBe(2); // storage + length
    });
  });

  // An array serializes to a single slot holding every element's fields back to back.
  describe('ARRAY', () => {
    it('round-trips a mix of Some and None elements', () => {
      const data = [Option.some(new Fr(7)), Option.none<Fr>(), Option.some(new Fr(9))];
      const out = roundTrip(ARRAY(OPTION(FIELD)), data);
      expect(out.map(o => o.isSome())).toEqual([true, false, true]);
      expect(out[0].value).toEqual(new Fr(7));
      expect(out[2].value).toEqual(new Fr(9));
    });

    it('rejects an element that under-reads its slot', () => {
      expect(() => ARRAY(UNDER_READS_SLOT_TYPE).deserialization!.fn([new FieldReader([new Fr(1), new Fr(2)])])).toThrow(
        'unexpected trailing field(s)',
      );
    });
  });

  // A vector carries its element count on the wire, so it takes a length slot ahead of its contents.
  describe('VECTOR', () => {
    it('round-trips a mix of Some and None elements', () => {
      const data = [Option.some(new Fr(7)), Option.none<Fr>(), Option.some(new Fr(9))];
      const out = roundTrip(VECTOR(OPTION(FIELD)), data);
      expect(out.map(o => o.isSome())).toEqual([true, false, true]);
      expect(out[0].value).toEqual(new Fr(7));
      expect(out[2].value).toEqual(new Fr(9));
    });

    it('round-trips an empty vector', () => {
      expect(roundTrip(VECTOR(FIELD), [])).toEqual([]);
    });

    it('round-trips multi-field elements', () => {
      const data = [
        { x: Fr.random(), y: Fr.random() },
        { x: Fr.random(), y: Fr.random() },
      ];
      expect(roundTrip(VECTOR(POINT), data)).toEqual(data);
    });

    it('round-trips generic-length array elements', () => {
      const data = [
        [new Fr(1), new Fr(2), new Fr(3)],
        [new Fr(4), new Fr(5), new Fr(6)],
      ];
      expect(roundTrip(VECTOR(ARRAY(FIELD)), data)).toEqual(data);
    });

    it('round-trips an empty vector of array elements', () => {
      expect(roundTrip(VECTOR(ARRAY(FIELD)), [])).toEqual([]);
    });

    it('serializes the length ahead of the contents', () => {
      expect(VECTOR(FIELD).serialization!.fn([new Fr(7), new Fr(9)])).toEqual([new Fr(2), [new Fr(7), new Fr(9)]]);
    });

    it('rejects a multi-slot element of unfixed width, such as a nested vector', () => {
      const length = new FieldReader([new Fr(1)]);
      const contents = new FieldReader([new Fr(1), new Fr(7)]);
      expect(() => VECTOR(VECTOR(FIELD)).deserialization!.fn([length, contents])).toThrow(
        "their width is not fixed by the type, so we can't tell how many fields each of their 2 slots holds",
      );
    });

    it('reads two input slots', () => {
      expect(slotsOf(VECTOR(FIELD))).toBe(2); // length + contents
    });
  });

  // An EphemeralArray param is a handle to a list of rows, each row being one flat slot of fields.
  describe('EPHEMERAL_ARRAY', () => {
    it('deserializes single-field rows', () => {
      const a = Fr.random();
      const b = Fr.random();
      expect(readEphemeralArray(FIELD, [[a], [b]])).toEqual([a, b]);
    });

    it('rejects a row with too few fields', () => {
      expect(() => readEphemeralArray(FIELD, [[]])).toThrow('Not enough fields to reconstruct shape');
    });

    it('rejects a row with trailing fields', () => {
      expect(() => readEphemeralArray(FIELD, [[Fr.random(), Fr.random()]])).toThrow('unexpected trailing field(s)');
    });

    it('rejects a multi-field row with trailing fields', async () => {
      const row = toRow<LogRetrievalRequest>(LOG_RETRIEVAL_REQUEST, {
        contractAddress: await AztecAddress.random(),
        tag: new Tag(Fr.random()),
        source: LogSource.PUBLIC_AND_PRIVATE,
        fromBlock: Option.none(),
        toBlock: Option.none(),
      });
      expect(() => readEphemeralArray(LOG_RETRIEVAL_REQUEST, [[...row, Fr.random()]])).toThrow(
        'unexpected trailing field(s)',
      );
    });

    it('deserializes multi-slot rows with a None', () => {
      // A row is one flat slot, but an Option element spans two; the deserializer rebuilds the element's slots from the
      // row's fields. The None keeps that reconstruction honest (OPTION owns the skip behavior).
      const present = Fr.random();
      const rows = [Option.some(present), Option.none<Fr>()].map(opt => toRow(OPTION(FIELD), opt));
      const result = readEphemeralArray(OPTION(FIELD), rows);
      expect(result[0].isSome()).toBe(true);
      expect(result[0].value).toEqual(present);
      expect(result[1].isNone()).toBe(true);
    });

    /** Reads an input-mode EphemeralArray backed by `rows`, as the registry does when deserializing a param. */
    function readEphemeralArray<T>(element: TypeMapping<T>, rows: Fr[][]): T[] {
      const service = new EphemeralArrayService();
      const slot = service.newArray(rows);
      const array = EPHEMERAL_ARRAY(element).deserialization!.fn([new FieldReader([slot])]);
      return array.readAll(service);
    }

    /** Serializes a value to a single flat field row, the way an EphemeralArray stores each element. */
    function toRow<T>(element: TypeMapping<T>, value: T): Fr[] {
      return element.serialization!.fn(value).flatMap(slot => (Array.isArray(slot) ? slot : [slot]));
    }
  });

  describe('MEMBERSHIP_WITNESS', () => {
    it('serializes to its declared shape', () => {
      const witness = MEMBERSHIP_WITNESS(4);
      expect(shapeOf(witness.serialization!.fn(MembershipWitness.random(4)))).toEqual(witness.shape);
    });
  });

  describe('label', () => {
    it('renders a scalar leaf as its kind', () => {
      expect(FIELD.label).toBe('field');
      expect(TX_HASH.label).toBe('field');
      expect(AZTEC_ADDRESS.label).toBe('aztec-address');
    });

    it('recurses through composites, including numeric generics', () => {
      expect(OPTION(ARRAY(FIELD)).label).toBe('option(array(field))');
      expect(FIXED_ARRAY(FIELD, 4).label).toBe('array(field,4)');
      expect(FIXED_BOUNDED_VEC(AZTEC_ADDRESS, 8).label).toBe('bounded-vec(aztec-address,8)');
      expect(EPHEMERAL_ARRAY(FIELD).label).toBe('ephemeral-array(field)');
      expect(VECTOR(FIELD).label).toBe('vector(field)');
    });

    it('renders a struct namelessly, splicing nested structs into the parent', () => {
      const inner = STRUCT([{ name: 'blockNumber', type: U32 }]);
      const struct = STRUCT([
        { name: 'txHash', type: TX_HASH },
        { name: 'origin', type: inner },
        { name: 'wrapped', type: OPTION(inner) },
      ]);
      expect(struct.label).toBe('{field,u32,option({u32})}');
    });
  });
});

/** A field mapping that throws on a zero, proving a None skips its zero-padded inner instead of parsing it. */
const REJECTS_ZERO_FIELD_TYPE: TypeMapping<Fr> = SCALAR({
  kind: 'field',
  serialization: { fn: v => [v] },
  deserialization: {
    fn: ([reader]) => {
      const field = reader.readField();
      if (field.isZero()) {
        throw new Error('REJECTS_ZERO_FIELD_TYPE read a zero value');
      }
      return field;
    },
  },
});

/** A mapping whose shape claims two fields but whose fn reads only one, leaving a trailing field unread. */
const UNDER_READS_SLOT_TYPE: TypeMapping<Fr> = LEAF({
  kind: 'field',
  deserialization: { fn: ([reader]) => reader.readField() },
  shape: [{ len: 2 }],
});

/** Round-trips a value through a bidirectional mapping: serialize to wire slots, then deserialize back. */
function roundTrip<T>(mapping: TypeMapping<T>, value: T): T {
  const slots = mapping.serialization!.fn(value);
  const readers = slots.map(slot => new FieldReader(Array.isArray(slot) ? slot : [slot]));
  return mapping.deserialization!.fn(readers);
}

/** Converts serialized wire slots into the hex `InputSlot[]` form the registry's `deserializeParams` expects. */
function toInputSlots(slots: (Fr | Fr[])[]): string[][] {
  return slots.map(slot => (Array.isArray(slot) ? slot : [slot]).map(f => f.toString()));
}

/** Deserializes a single-slot scalar mapping (U32, U8, ...) from one field. */
function deserialize<T>(mapping: TypeMapping<T>, value: Fr): T {
  return mapping.deserialization!.fn([new FieldReader([value])]);
}

/** The wire shape of an already-serialized value, for comparing against a type's declared `shape`. */
function shapeOf(slots: (Fr | Fr[])[]): SlotShape[] {
  return slots.map(slot => (Array.isArray(slot) ? { len: slot.length } : 'scalar'));
}
