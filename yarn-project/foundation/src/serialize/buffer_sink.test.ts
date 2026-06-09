import { Fq, Fr } from '../curves/bn254/field.js';
import { BufferReader } from './buffer_reader.js';
import { BufferSink, serializeArrayToSink, serializeToSink } from './buffer_sink.js';
import { bigintToUInt64BE, bigintToUInt128BE, numToUInt32BE } from './free_funcs.js';
import { boolToBuffer, serializeArrayOfBufferableToVector, serializeBigInt, serializeToBuffer } from './serialize.js';

// These bigints exercise the full 32-byte width: zero (hits the legacy zero fast-path), small values,
// odd limb boundaries, and the largest value that still fits 32 bytes.
const FIELD_VALUES = [
  0n,
  1n,
  0xffn,
  0x1234567890abcdefn,
  (1n << 64n) - 1n,
  (1n << 64n) + 1n,
  (1n << 200n) + 123n,
  (1n << 256n) - 1n,
];

describe('BufferSink', () => {
  describe('writeField / writeBigInt(32) match serializeBigInt byte-for-byte', () => {
    it.each(FIELD_VALUES)('writeField(%s)', value => {
      const sink = new BufferSink();
      sink.writeField(value);
      expect(sink.toBuffer()).toEqual(serializeBigInt(value, 32));
    });

    it.each(FIELD_VALUES)('writeBigInt(%s) defaults to 32 bytes', value => {
      const sink = new BufferSink();
      sink.writeBigInt(value);
      expect(sink.toBuffer()).toEqual(serializeBigInt(value, 32));
    });
  });

  describe('writeBigInt with non-32 width (per-byte branch) matches serializeBigInt', () => {
    // Exercises both the pure-limb path (widths that are multiples of 8) and the limb + leftover-head-byte
    // path (widths that are not), at zero, small, mid, and max-for-width values.
    const cases: Array<[bigint, number]> = [
      [0n, 16],
      [1n, 16],
      [(1n << 128n) - 1n, 16],
      [0xabcdn, 2],
      [255n, 1],
      [(1n << 64n) - 1n, 8],
      [42n, 20],
      [(1n << 160n) - 1n, 20],
      [(1n << 136n) - 1n, 17],
      [(1n << 192n) - 1n, 24],
      [(1n << 248n) - 1n, 31],
      [(1n << 384n) - 1n, 48],
      [0x23456789abcdefn, 7],
    ];
    it.each(cases)('writeBigInt(%s, %i)', (value, width) => {
      const sink = new BufferSink();
      sink.writeBigInt(value, width);
      expect(sink.toBuffer()).toEqual(serializeBigInt(value, width));
    });

    it('matches bigintToUInt128BE for 16-byte writes', () => {
      const value = 0x0123456789abcdef0123456789abcdefn;
      const sink = new BufferSink();
      sink.writeBigInt(value, 16);
      expect(sink.toBuffer()).toEqual(bigintToUInt128BE(value));
    });
  });

  describe('rejects out-of-range bigints', () => {
    it('throws when writeField overflows 32 bytes', () => {
      expect(() => new BufferSink().writeField(1n << 256n)).toThrow(/does not fit into 32 bytes/);
    });
    it('throws when writeBigInt overflows the default 32 bytes', () => {
      expect(() => new BufferSink().writeBigInt(1n << 256n)).toThrow(/does not fit into 32 bytes/);
    });
    it('throws when writeBigInt overflows a narrow width', () => {
      expect(() => new BufferSink().writeBigInt(1n << 128n, 16)).toThrow(/does not fit into 16 bytes/);
    });
    it('throws on negative values', () => {
      expect(() => new BufferSink().writeField(-1n)).toThrow(/negative/);
      expect(() => new BufferSink().writeBigInt(-5n)).toThrow(/negative/);
    });
  });

  describe('primitive writers match the legacy free functions', () => {
    const write = (fn: (sink: BufferSink) => void): Buffer => {
      const sink = new BufferSink();
      fn(sink);
      return sink.toBuffer();
    };

    it('writeBool', () => {
      expect(write(s => s.writeBool(true))).toEqual(boolToBuffer(true));
      expect(write(s => s.writeBool(false))).toEqual(boolToBuffer(false));
    });
    it('writeNumber matches numToUInt32BE', () => {
      expect(write(s => s.writeNumber(0xdeadbeef))).toEqual(numToUInt32BE(0xdeadbeef));
    });
    it('writeUInt64 matches bigintToUInt64BE', () => {
      const v = 0x1122334455667788n;
      expect(write(s => s.writeUInt64(v))).toEqual(bigintToUInt64BE(v));
    });
    it('writeUInt16 / writeUInt8 are big-endian', () => {
      expect(write(s => s.writeUInt16(0xbeef))).toEqual(Buffer.from([0xbe, 0xef]));
      expect(write(s => s.writeUInt8(0x7f))).toEqual(Buffer.from([0x7f]));
    });
    it('writeString is a 4-byte length prefix followed by UTF-8 bytes', () => {
      const value = 'héllo';
      const utf8 = Buffer.from(value);
      expect(write(s => s.writeString(value))).toEqual(Buffer.concat([numToUInt32BE(utf8.length), utf8]));
    });
  });

  describe('writeFields fast path', () => {
    it('matches a sequence of individual writeField calls', () => {
      const fields = FIELD_VALUES.filter(v => v <= (1n << 256n) - 1n).map(v => new Fr(v % Fr.MODULUS));
      const sink = new BufferSink();
      sink.writeFields(fields);

      const expected = serializeToBuffer(fields);
      expect(sink.toBuffer()).toEqual(expected);
    });

    it('throws on a negative element', () => {
      expect(() => new BufferSink().writeFields([{ toBigInt: () => -1n }])).toThrow(/negative/);
    });
  });

  describe('capacity growth', () => {
    it('grows from a tiny initial capacity without corrupting data', () => {
      const sink = new BufferSink(1);
      const values = Array.from({ length: 300 }, (_, i) => BigInt(i) * 7n);
      for (const v of values) {
        sink.writeField(v);
      }
      expect(sink.length).toBe(300 * 32);
      expect(sink.toBuffer()).toEqual(Buffer.concat(values.map(v => serializeBigInt(v, 32))));
    });
  });

  describe('reset reuses the backing buffer', () => {
    it('drops the cursor while leaving previously returned buffers intact', () => {
      const sink = new BufferSink();
      sink.writeField(123n);
      const first = sink.toBuffer();

      sink.reset();
      expect(sink.length).toBe(0);

      sink.writeField(456n);
      expect(sink.toBuffer()).toEqual(serializeBigInt(456n, 32));
      // The earlier toBuffer() is a copy, so it survives the reset + reuse.
      expect(first).toEqual(serializeBigInt(123n, 32));
    });
  });

  describe('asUint8Array', () => {
    it('returns a zero-copy view of the written region', () => {
      const sink = new BufferSink(64);
      sink.writeField(7n);
      const view = sink.asUint8Array();
      expect(view.length).toBe(32);
      expect(view[31]).toBe(7);
    });
  });

  describe('serializeToSink dispatch matches serializeToBuffer', () => {
    it('handles mixed primitives, buffers, and nested arrays', () => {
      const sink = new BufferSink();
      serializeToSink(sink, true, 5, 9000000000n, 'hi', Buffer.from([1, 2, 3]), [false, 7]);

      const expected = serializeToBuffer(true, 5, 9000000000n, 'hi', Buffer.from([1, 2, 3]), [false, 7]);
      expect(sink.toBuffer()).toEqual(expected);
    });

    it('streams a migrated node (writes into the sink, returns void)', () => {
      const migrated = { toBuffer: (sink: BufferSink) => sink.writeUInt8(0xcc) };
      const sink = new BufferSink();
      serializeToSink(sink, migrated);
      expect(sink.toBuffer()).toEqual(Buffer.from([0xcc]));
    });

    it('folds in a not-yet-migrated node via the return-value fallback', () => {
      const legacy = { toBuffer: () => Buffer.from([0xaa, 0xbb]) };
      const sink = new BufferSink();
      serializeToSink(sink, legacy);
      expect(sink.toBuffer()).toEqual(Buffer.from([0xaa, 0xbb]));
    });

    it('throws on an unsupported value', () => {
      expect(() => serializeToSink(new BufferSink(), { not: 'serializable' } as any)).toThrow(/Cannot serialize/);
    });
  });

  describe('serializeArrayToSink matches serializeArrayOfBufferableToVector', () => {
    it('writes a 4-byte count prefix, flattening nested arrays', () => {
      const sink = new BufferSink();
      serializeArrayToSink(sink, [1, [2, 3], 4], 4);
      expect(sink.toBuffer()).toEqual(serializeArrayOfBufferableToVector([1, [2, 3], 4], 4));
    });

    it('writes a 1-byte count prefix', () => {
      const sink = new BufferSink();
      serializeArrayToSink(sink, [1, 2, 3], 1);
      expect(sink.toBuffer()).toEqual(serializeArrayOfBufferableToVector([1, 2, 3], 1));
    });

    it('rejects an unsupported prefix length', () => {
      expect(() => serializeArrayToSink(new BufferSink(), [1], 2)).toThrow(/prefix length/);
    });
  });

  describe('BufferSink.serialize', () => {
    it('serializes a migrated object into a single buffer', () => {
      const obj = { toBuffer: (sink: BufferSink) => serializeToSink(sink, 1n, 2, true) };
      expect(BufferSink.serialize(obj)).toEqual(serializeToBuffer(1n, 2, true));
    });
  });

  // alexg's suggestion: write into a sink, then read everything back out with a BufferReader.
  describe('round-trips through BufferReader', () => {
    it('reads back exactly what was written', () => {
      const fr = Fr.random();
      const fq = Fq.random();
      const sink = new BufferSink();
      sink.writeBool(true);
      sink.writeNumber(0x01020304);
      sink.writeUInt64(0xdeadbeefcafebaben);
      sink.writeField(fr.toBigInt());
      sink.writeBigInt(fq.toBigInt());
      sink.writeString('blob-sink');

      const reader = BufferReader.asReader(sink.toBuffer());
      expect(reader.readBoolean()).toBe(true);
      expect(reader.readNumber()).toBe(0x01020304);
      expect(reader.readUInt64()).toBe(0xdeadbeefcafebaben);
      expect(reader.readObject(Fr)).toEqual(fr);
      expect(reader.readObject(Fq)).toEqual(fq);
      expect(reader.readString()).toBe('blob-sink');
    });

    it('round-trips a field vector written via serializeArrayToSink', () => {
      const fields = Array.from({ length: 5 }, () => Fr.random());
      const sink = new BufferSink();
      serializeArrayToSink(sink, fields, 4);

      const reader = BufferReader.asReader(sink.toBuffer());
      expect(reader.readVector(Fr)).toEqual(fields);
    });
  });
});
