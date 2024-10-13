import { type AvmContext } from '../avm_context.js';
import { Field, Uint8, Uint16, Uint32 } from '../avm_memory_types.js';
import { TagCheckError } from '../errors.js';
import { initContext } from '../fixtures/index.js';
import { Opcode } from '../serialization/instruction_serialization.js';
import { Eq, Lt, Lte } from './comparators.js';

describe('Comparators', () => {
  let context: AvmContext;

  beforeEach(() => {
    context = initContext();
  });

  describe('Eq', () => {
    it('Should deserialize correctly', () => {
      const buf = Buffer.from([
        Opcode.EQ_16, // opcode
        0x01, // indirect
        ...Buffer.from('1234', 'hex'), // aOffset
        ...Buffer.from('2345', 'hex'), // bOffset
        ...Buffer.from('3456', 'hex'), // dstOffset
      ]);
      const inst = new Eq(/*indirect=*/ 0x01, /*aOffset=*/ 0x1234, /*bOffset=*/ 0x2345, /*dstOffset=*/ 0x3456).as(
        Opcode.EQ_16,
        Eq.wireFormat16,
      );

      expect(Eq.as(Eq.wireFormat16).deserialize(buf)).toEqual(inst);
      expect(inst.serialize()).toEqual(buf);
    });

    it('Works on integral types', async () => {
      context.machineState.memory.setSlice(0, [new Uint32(1), new Uint32(2), new Uint32(3), new Uint32(1)]);

      const ops = [
        new Eq(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 10),
        new Eq(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 2, /*dstOffset=*/ 11),
        new Eq(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 3, /*dstOffset=*/ 12),
      ];

      for (const op of ops) {
        await op.execute(context);
      }

      const actual = context.machineState.memory.getSlice(/*offset=*/ 10, /*size=*/ 3);
      expect(actual).toEqual([new Uint8(0), new Uint8(0), new Uint8(1)]);
    });

    it('Works on field elements', async () => {
      context.machineState.memory.setSlice(0, [new Field(1), new Field(2), new Field(3), new Field(1)]);

      const ops = [
        new Eq(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 10),
        new Eq(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 2, /*dstOffset=*/ 11),
        new Eq(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 3, /*dstOffset=*/ 12),
      ];

      for (const op of ops) {
        await op.execute(context);
      }

      const actual = context.machineState.memory.getSlice(/*offset=*/ 10, /*size=*/ 3);
      expect(actual).toEqual([new Uint8(0), new Uint8(0), new Uint8(1)]);
    });

    it('InTag is checked', async () => {
      context.machineState.memory.setSlice(0, [new Field(1), new Uint32(2), new Uint16(3)]);

      const ops = [
        new Eq(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 10),
        new Eq(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 2, /*dstOffset=*/ 10),
        new Eq(/*indirect=*/ 0, /*aOffset=*/ 1, /*bOffset=*/ 2, /*dstOffset=*/ 10),
      ];

      for (const o of ops) {
        await expect(async () => await o.execute(context)).rejects.toThrow(TagCheckError);
      }
    });
  });

  describe('Lt', () => {
    it('Should deserialize correctly', () => {
      const buf = Buffer.from([
        Opcode.LT_16, // opcode
        0x01, // indirect
        ...Buffer.from('1234', 'hex'), // aOffset
        ...Buffer.from('2345', 'hex'), // bOffset
        ...Buffer.from('3456', 'hex'), // dstOffset
      ]);
      const inst = new Lt(/*indirect=*/ 0x01, /*aOffset=*/ 0x1234, /*bOffset=*/ 0x2345, /*dstOffset=*/ 0x3456).as(
        Opcode.LT_16,
        Lt.wireFormat16,
      );

      expect(Lt.as(Lt.wireFormat16).deserialize(buf)).toEqual(inst);
      expect(inst.serialize()).toEqual(buf);
    });

    it('Works on integral types', async () => {
      context.machineState.memory.setSlice(0, [new Uint32(1), new Uint32(2), new Uint32(0)]);

      const ops = [
        new Lt(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 0, /*dstOffset=*/ 10),
        new Lt(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 11),
        new Lt(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 2, /*dstOffset=*/ 12),
      ];

      for (const op of ops) {
        await op.execute(context);
      }

      const actual = context.machineState.memory.getSlice(/*offset=*/ 10, /*size=*/ 3);
      expect(actual).toEqual([new Uint8(0), new Uint8(1), new Uint8(0)]);
    });

    it('Works on field elements', async () => {
      context.machineState.memory.setSlice(0, [new Field(1), new Field(2), new Field(0)]);

      const ops = [
        new Lt(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 0, /*dstOffset=*/ 10),
        new Lt(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 11),
        new Lt(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 2, /*dstOffset=*/ 12),
      ];

      for (const op of ops) {
        await op.execute(context);
      }

      const actual = context.machineState.memory.getSlice(/*offset=*/ 10, /*size=*/ 3);
      expect(actual).toEqual([new Uint8(0), new Uint8(1), new Uint8(0)]);
    });

    it('InTag is checked', async () => {
      context.machineState.memory.setSlice(0, [new Field(1), new Uint32(2), new Uint16(3)]);

      const ops = [
        new Lt(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 10),
        new Lt(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 2, /*dstOffset=*/ 10),
        new Lt(/*indirect=*/ 0, /*aOffset=*/ 1, /*bOffset=*/ 2, /*dstOffset=*/ 10),
      ];

      for (const o of ops) {
        await expect(async () => await o.execute(context)).rejects.toThrow(TagCheckError);
      }
    });
  });

  describe('Lte', () => {
    it('Should deserialize correctly', () => {
      const buf = Buffer.from([
        Opcode.LTE_16, // opcode
        0x01, // indirect
        ...Buffer.from('1234', 'hex'), // aOffset
        ...Buffer.from('2345', 'hex'), // bOffset
        ...Buffer.from('3456', 'hex'), // dstOffset
      ]);
      const inst = new Lte(/*indirect=*/ 0x01, /*aOffset=*/ 0x1234, /*bOffset=*/ 0x2345, /*dstOffset=*/ 0x3456).as(
        Opcode.LTE_16,
        Lte.wireFormat16,
      );

      expect(Lte.as(Lte.wireFormat16).deserialize(buf)).toEqual(inst);
      expect(inst.serialize()).toEqual(buf);
    });

    it('Works on integral types', async () => {
      context.machineState.memory.setSlice(0, [new Uint32(1), new Uint32(2), new Uint32(0)]);

      const ops = [
        new Lte(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 0, /*dstOffset=*/ 10),
        new Lte(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 11),
        new Lte(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 2, /*dstOffset=*/ 12),
      ];

      for (const op of ops) {
        await op.execute(context);
      }

      const actual = context.machineState.memory.getSlice(/*offset=*/ 10, /*size=*/ 3);
      expect(actual).toEqual([new Uint8(1), new Uint8(1), new Uint8(0)]);
    });

    it('Works on field elements', async () => {
      context.machineState.memory.setSlice(0, [new Field(1), new Field(2), new Field(0)]);

      const ops = [
        new Lte(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 0, /*dstOffset=*/ 10),
        new Lte(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 11),
        new Lte(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 2, /*dstOffset=*/ 12),
      ];

      for (const op of ops) {
        await op.execute(context);
      }

      const actual = context.machineState.memory.getSlice(/*offset=*/ 10, /*size=*/ 3);
      expect(actual).toEqual([new Uint8(1), new Uint8(1), new Uint8(0)]);
    });

    it('InTag is checked', async () => {
      context.machineState.memory.setSlice(0, [new Field(1), new Uint32(2), new Uint16(3)]);

      const ops = [
        new Lte(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 10),
        new Lte(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 2, /*dstOffset=*/ 10),
        new Lte(/*indirect=*/ 0, /*aOffset=*/ 1, /*bOffset=*/ 2, /*dstOffset=*/ 10),
      ];

      for (const o of ops) {
        await expect(async () => await o.execute(context)).rejects.toThrow(TagCheckError);
      }
    });
  });
});
