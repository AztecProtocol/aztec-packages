import {
  AVM_ADDRESSING_BASE_L2_GAS,
  AVM_CALLDATACOPY_BASE_L2_GAS,
  AVM_CALLDATACOPY_DYN_L2_GAS,
  AVM_RETURNDATACOPY_BASE_L2_GAS,
  AVM_RETURNDATACOPY_DYN_L2_GAS,
} from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';

import type { AvmContext } from '../avm_context.js';
import { Field, TaggedMemory, TypeTag, Uint8, Uint16, Uint32, Uint64, Uint128 } from '../avm_memory_types.js';
import { MemorySliceOutOfRangeError } from '../errors.js';
import { initContext, initExecutionEnvironment } from '../fixtures/index.js';
import { Opcode } from '../serialization/instruction_serialization.js';
import { Addressing, AddressingMode } from './addressing_mode.js';
import { CalldataCopy, Cast, Mov, ReturndataCopy, ReturndataSize, Set } from './memory.js';

describe('Memory instructions', () => {
  let context: AvmContext;

  beforeEach(() => {
    context = initContext();
  });

  describe('SET', () => {
    it('Should (de)serialize correctly [tag=u8]', () => {
      const buf = Buffer.from([
        Opcode.SET_8, // opcode
        0x01, // indirect
        ...Buffer.from('56', 'hex'), // dstOffset
        TypeTag.UINT8, // inTag
        ...Buffer.from('12', 'hex'),
      ]);
      const inst = new Set(/*indirect=*/ 0x01, /*dstOffset=*/ 0x56, /*inTag=*/ TypeTag.UINT8, /*value=*/ 0x12).as(
        Opcode.SET_8,
        Set.wireFormat8,
      );

      expect(Set.as(Set.wireFormat8).fromBuffer(buf)).toEqual(inst);
      expect(inst.toBuffer()).toEqual(buf);
    });

    it('Should (de)serialize correctly [tag=u16]', () => {
      const buf = Buffer.from([
        Opcode.SET_16, // opcode
        0x01, // indirect
        ...Buffer.from('3456', 'hex'), // dstOffset
        TypeTag.UINT16, // inTag
        ...Buffer.from('1234', 'hex'),
      ]);
      const inst = new Set(/*indirect=*/ 0x01, /*dstOffset=*/ 0x3456, /*inTag=*/ TypeTag.UINT16, /*value=*/ 0x1234).as(
        Opcode.SET_16,
        Set.wireFormat16,
      );

      expect(Set.as(Set.wireFormat16).fromBuffer(buf)).toEqual(inst);
      expect(inst.toBuffer()).toEqual(buf);
    });

    it('Should (de)serialize correctly [tag=u32]', () => {
      const buf = Buffer.from([
        Opcode.SET_32, // opcode
        0x01, // indirect
        ...Buffer.from('3456', 'hex'), // dstOffset
        TypeTag.UINT32, // inTag
        ...Buffer.from('12345678', 'hex'),
      ]);
      const inst = new Set(
        /*indirect=*/ 0x01,
        /*dstOffset=*/ 0x3456,
        /*inTag=*/ TypeTag.UINT32,
        /*value=*/ 0x12345678,
      ).as(Opcode.SET_32, Set.wireFormat32);

      expect(Set.as(Set.wireFormat32).fromBuffer(buf)).toEqual(inst);
      expect(inst.toBuffer()).toEqual(buf);
    });

    it('Should (de)serialize correctly [tag=u64]', () => {
      const buf = Buffer.from([
        Opcode.SET_64, // opcode
        0x01, // indirect
        ...Buffer.from('34567', 'hex'), // dstOffset
        TypeTag.UINT64, // inTag
        ...Buffer.from('1234567812345678', 'hex'),
      ]);
      const inst = new Set(
        /*indirect=*/ 0x01,
        /*dstOffset=*/ 0x3456,
        /*inTag=*/ TypeTag.UINT64,
        /*value=*/ 0x1234567812345678n,
      ).as(Opcode.SET_64, Set.wireFormat64);

      expect(Set.as(Set.wireFormat64).fromBuffer(buf)).toEqual(inst);
      expect(inst.toBuffer()).toEqual(buf);
    });

    it('Should (de)serialize correctly [tag=u128]', () => {
      const buf = Buffer.from([
        Opcode.SET_128, // opcode
        0x01, // indirect
        ...Buffer.from('3456', 'hex'), // dstOffset
        TypeTag.UINT128, // inTag
        ...Buffer.from('12345678123456781234567812345678', 'hex'), // const (will be 128 bit)
      ]);
      const inst = new Set(
        /*indirect=*/ 0x01,
        /*dstOffset=*/ 0x3456,
        /*inTag=*/ TypeTag.UINT128,
        /*value=*/ 0x12345678123456781234567812345678n,
      ).as(Opcode.SET_128, Set.wireFormat128);

      expect(Set.as(Set.wireFormat128).fromBuffer(buf)).toEqual(inst);
      expect(inst.toBuffer()).toEqual(buf);
    });

    it('Should (de)serialize correctly [tag=ff]', () => {
      const buf = Buffer.from([
        Opcode.SET_FF, // opcode
        0x01, // indirect
        ...Buffer.from('3456', 'hex'), // dstOffset
        TypeTag.UINT128, // inTag
        ...Buffer.from('1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef', 'hex'), // const (will be 32 bytes)
      ]);
      const inst = new Set(
        /*indirect=*/ 0x01,
        /*dstOffset=*/ 0x3456,
        /*inTag=*/ TypeTag.UINT128,
        /*value=*/ 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdefn,
      ).as(Opcode.SET_FF, Set.wireFormatFF);

      expect(Set.as(Set.wireFormatFF).fromBuffer(buf)).toEqual(inst);
      expect(inst.toBuffer()).toEqual(buf);
    });

    it('should correctly set value and tag (uninitialized)', async () => {
      await new Set(/*indirect=*/ 0, /*offset=*/ 1, /*inTag=*/ TypeTag.UINT16, /*value=*/ 1234n).execute(context);

      const actual = context.machineState.memory.get(1);
      const tag = context.machineState.memory.getTag(1);

      expect(actual).toEqual(new Uint16(1234n));
      expect(tag).toEqual(TypeTag.UINT16);
    });

    it('should correctly set value and tag (overwriting)', async () => {
      context.machineState.memory.set(1, new Field(27));

      await new Set(/*indirect=*/ 0, /*offset=*/ 1, /*inTag=*/ TypeTag.UINT32, /*value=*/ 1234n).execute(context);

      const actual = context.machineState.memory.get(1);
      const tag = context.machineState.memory.getTag(1);

      expect(actual).toEqual(new Uint32(1234n));
      expect(tag).toEqual(TypeTag.UINT32);
    });

    it('should correctly set value and tag (truncating)', async () => {
      await new Set(/*indirect=*/ 0, /*offset=*/ 1, /*inTag=*/ TypeTag.UINT16, /*value=*/ 0x12345678n).execute(context);

      const actual = context.machineState.memory.get(1);
      const tag = context.machineState.memory.getTag(1);

      expect(actual).toEqual(new Uint16(0x5678));
      expect(tag).toEqual(TypeTag.UINT16);
    });
  });

  describe('CAST', () => {
    it('Should deserialize correctly', () => {
      const buf = Buffer.from([
        Opcode.CAST_16, // opcode
        0x01, // indirect
        ...Buffer.from('1234', 'hex'), // aOffset
        ...Buffer.from('3456', 'hex'), // dstOffset
        TypeTag.FIELD, // dstTag
      ]);
      const inst = new Cast(
        /*indirect=*/ 0x01,
        /*aOffset=*/ 0x1234,
        /*dstOffset=*/ 0x3456,
        /*dstTag=*/ TypeTag.FIELD,
      ).as(Opcode.CAST_16, Cast.wireFormat16);

      expect(Cast.as(Cast.wireFormat16).fromBuffer(buf)).toEqual(inst);
      expect(inst.toBuffer()).toEqual(buf);
    });

    it('Should upcast between integral types', async () => {
      context.machineState.memory.set(0, new Uint8(20n));
      context.machineState.memory.set(1, new Uint16(65000n));
      context.machineState.memory.set(2, new Uint32(1n << 30n));
      context.machineState.memory.set(3, new Uint64(1n << 50n));
      context.machineState.memory.set(4, new Uint128(1n << 100n));

      const ops = [
        new Cast(/*indirect=*/ 0, /*aOffset=*/ 0, /*dstOffset=*/ 10, /*dstTag=*/ TypeTag.UINT16),
        new Cast(/*indirect=*/ 0, /*aOffset=*/ 1, /*dstOffset=*/ 11, /*dstTag=*/ TypeTag.UINT32),
        new Cast(/*indirect=*/ 0, /*aOffset=*/ 2, /*dstOffset=*/ 12, /*dstTag=*/ TypeTag.UINT64),
        new Cast(/*indirect=*/ 0, /*aOffset=*/ 3, /*dstOffset=*/ 13, /*dstTag=*/ TypeTag.UINT128),
        new Cast(/*indirect=*/ 0, /*aOffset=*/ 4, /*dstOffset=*/ 14, /*dstTag=*/ TypeTag.UINT128),
      ];

      for (const op of ops) {
        await op.execute(context);
      }

      const actual = context.machineState.memory.getSlice(/*offset=*/ 10, /*size=*/ 5);
      expect(actual).toEqual([
        new Uint16(20n),
        new Uint32(65000n),
        new Uint64(1n << 30n),
        new Uint128(1n << 50n),
        new Uint128(1n << 100n),
      ]);
      const tags = context.machineState.memory.getSliceTags(/*offset=*/ 10, /*size=*/ 5);
      expect(tags).toEqual([TypeTag.UINT16, TypeTag.UINT32, TypeTag.UINT64, TypeTag.UINT128, TypeTag.UINT128]);
    });

    it('Should downcast (truncating) between integral types', async () => {
      context.machineState.memory.set(0, new Uint8(20n));
      context.machineState.memory.set(1, new Uint16(65000n));
      context.machineState.memory.set(2, new Uint32((1n << 30n) - 1n));
      context.machineState.memory.set(3, new Uint64((1n << 50n) - 1n));
      context.machineState.memory.set(4, new Uint128((1n << 100n) - 1n));

      const ops = [
        new Cast(/*indirect=*/ 0, /*aOffset=*/ 0, /*dstOffset=*/ 10, /*dstTag=*/ TypeTag.UINT8),
        new Cast(/*indirect=*/ 0, /*aOffset=*/ 1, /*dstOffset=*/ 11, /*dstTag=*/ TypeTag.UINT8),
        new Cast(/*indirect=*/ 0, /*aOffset=*/ 2, /*dstOffset=*/ 12, /*dstTag=*/ TypeTag.UINT16),
        new Cast(/*indirect=*/ 0, /*aOffset=*/ 3, /*dstOffset=*/ 13, /*dstTag=*/ TypeTag.UINT32),
        new Cast(/*indirect=*/ 0, /*aOffset=*/ 4, /*dstOffset=*/ 14, /*dstTag=*/ TypeTag.UINT64),
      ];

      for (const op of ops) {
        await op.execute(context);
      }

      const actual = context.machineState.memory.getSlice(/*offset=*/ 10, /*size=*/ 5);
      expect(actual).toEqual([
        new Uint8(20n),
        new Uint8(232),
        new Uint16((1n << 16n) - 1n),
        new Uint32((1n << 32n) - 1n),
        new Uint64((1n << 64n) - 1n),
      ]);
      const tags = context.machineState.memory.getSliceTags(/*offset=*/ 10, /*size=*/ 5);
      expect(tags).toEqual([TypeTag.UINT8, TypeTag.UINT8, TypeTag.UINT16, TypeTag.UINT32, TypeTag.UINT64]);
    });

    it('Should upcast from integral types to field', async () => {
      context.machineState.memory.set(0, new Uint8(20n));
      context.machineState.memory.set(1, new Uint16(65000n));
      context.machineState.memory.set(2, new Uint32(1n << 30n));
      context.machineState.memory.set(3, new Uint64(1n << 50n));
      context.machineState.memory.set(4, new Uint128(1n << 100n));

      const ops = [
        new Cast(/*indirect=*/ 0, /*aOffset=*/ 0, /*dstOffset=*/ 10, /*dstTag=*/ TypeTag.FIELD),
        new Cast(/*indirect=*/ 0, /*aOffset=*/ 1, /*dstOffset=*/ 11, /*dstTag=*/ TypeTag.FIELD),
        new Cast(/*indirect=*/ 0, /*aOffset=*/ 2, /*dstOffset=*/ 12, /*dstTag=*/ TypeTag.FIELD),
        new Cast(/*indirect=*/ 0, /*aOffset=*/ 3, /*dstOffset=*/ 13, /*dstTag=*/ TypeTag.FIELD),
        new Cast(/*indirect=*/ 0, /*aOffset=*/ 4, /*dstOffset=*/ 14, /*dstTag=*/ TypeTag.FIELD),
      ];

      for (const op of ops) {
        await op.execute(context);
      }

      const actual = context.machineState.memory.getSlice(/*offset=*/ 10, /*size=*/ 5);
      expect(actual).toEqual([
        new Field(20n),
        new Field(65000n),
        new Field(1n << 30n),
        new Field(1n << 50n),
        new Field(1n << 100n),
      ]);
      const tags = context.machineState.memory.getSliceTags(/*offset=*/ 10, /*size=*/ 5);
      expect(tags).toEqual([TypeTag.FIELD, TypeTag.FIELD, TypeTag.FIELD, TypeTag.FIELD, TypeTag.FIELD]);
    });

    it('Should downcast (truncating) from field to integral types', async () => {
      context.machineState.memory.set(0, new Field((1n << 200n) - 1n));
      context.machineState.memory.set(1, new Field((1n << 200n) - 1n));
      context.machineState.memory.set(2, new Field((1n << 200n) - 1n));
      context.machineState.memory.set(3, new Field((1n << 200n) - 1n));
      context.machineState.memory.set(4, new Field((1n << 200n) - 1n));

      const ops = [
        new Cast(/*indirect=*/ 0, /*aOffset=*/ 0, /*dstOffset=*/ 10, /*dstTag=*/ TypeTag.UINT8),
        new Cast(/*indirect=*/ 0, /*aOffset=*/ 1, /*dstOffset=*/ 11, /*dstTag=*/ TypeTag.UINT16),
        new Cast(/*indirect=*/ 0, /*aOffset=*/ 2, /*dstOffset=*/ 12, /*dstTag=*/ TypeTag.UINT32),
        new Cast(/*indirect=*/ 0, /*aOffset=*/ 3, /*dstOffset=*/ 13, /*dstTag=*/ TypeTag.UINT64),
        new Cast(/*indirect=*/ 0, /*aOffset=*/ 4, /*dstOffset=*/ 14, /*dstTag=*/ TypeTag.UINT128),
      ];

      for (const op of ops) {
        await op.execute(context);
      }

      const actual = context.machineState.memory.getSlice(/*offset=*/ 10, /*size=*/ 5);
      expect(actual).toEqual([
        new Uint8((1n << 8n) - 1n),
        new Uint16((1n << 16n) - 1n),
        new Uint32((1n << 32n) - 1n),
        new Uint64((1n << 64n) - 1n),
        new Uint128((1n << 128n) - 1n),
      ]);
      const tags = context.machineState.memory.getSliceTags(/*offset=*/ 10, /*size=*/ 5);
      expect(tags).toEqual([TypeTag.UINT8, TypeTag.UINT16, TypeTag.UINT32, TypeTag.UINT64, TypeTag.UINT128]);
    });

    it('Should cast between field elements', async () => {
      context.machineState.memory.set(0, new Field(12345678n));

      await new Cast(/*indirect=*/ 0, /*aOffset=*/ 0, /*dstOffset=*/ 1, /*dstTag=*/ TypeTag.FIELD).execute(context);

      const actual = context.machineState.memory.get(1);
      expect(actual).toEqual(new Field(12345678n));
      const tags = context.machineState.memory.getTag(1);
      expect(tags).toEqual(TypeTag.FIELD);
    });
  });

  describe('MOV', () => {
    it('Should (de)serialize correctly', () => {
      const buf = Buffer.from([
        Mov.opcode, // opcode
        0x01, // indirect
        ...Buffer.from('12', 'hex'), // srcOffset
        ...Buffer.from('34', 'hex'), // dstOffset
      ]);
      const inst = new Mov(/*indirect=*/ 0x01, /*srcOffset=*/ 0x12, /*dstOffset=*/ 0x34).as(
        Opcode.MOV_8,
        Mov.wireFormat8,
      );

      expect(Mov.as(Mov.wireFormat8).fromBuffer(buf)).toEqual(inst);
      expect(inst.toBuffer()).toEqual(buf);
    });

    it('Should move integrals on different memory cells', async () => {
      context.machineState.memory.set(0, new Uint16(27));
      await new Mov(/*indirect=*/ 0, /*srcOffset=*/ 0, /*dstOffset=*/ 1).execute(context);

      const actual = context.machineState.memory.get(1);
      const tag = context.machineState.memory.getTag(1);

      expect(actual).toEqual(new Uint16(27n));
      expect(tag).toEqual(TypeTag.UINT16);
    });

    it('Should support INDIRECT addressing', async () => {
      context.machineState.memory.set(0, new Uint16(55));
      context.machineState.memory.set(10, new Uint32(20));
      const addressing = Addressing.fromModes([
        /*srcOffset*/ AddressingMode.DIRECT,
        /*dstOffset*/ AddressingMode.INDIRECT,
      ]);
      await new Mov(/*indirect=*/ addressing.toWire(), /*srcOffset=*/ 0, /*dstOffset=*/ 10).execute(context);

      expect(context.machineState.memory.get(1)).toEqual(new Field(0));
      expect(context.machineState.memory.get(20)).toEqual(new Uint16(55n));
    });

    it('Should move field elements on different memory cells', async () => {
      context.machineState.memory.set(0, new Field(27));
      await new Mov(/*indirect=*/ 0, /*srcOffset=*/ 0, /*dstOffset=*/ 1).execute(context);

      const actual = context.machineState.memory.get(1);
      const tag = context.machineState.memory.getTag(1);

      expect(actual).toEqual(new Field(27n));
      expect(tag).toEqual(TypeTag.FIELD);
    });
  });

  describe('CALLDATACOPY', () => {
    it('Should (de)serialize correctly', () => {
      const buf = Buffer.from([
        CalldataCopy.opcode, // opcode
        0x10, // indirect
        ...Buffer.from('2345', 'hex'), // copysizeOffset
        ...Buffer.from('1234', 'hex'), // cdOffsetAddress
        ...Buffer.from('3456', 'hex'), // dstOffset
      ]);
      const inst = new CalldataCopy(
        /*indirect=*/ 0x10,
        /*copysizeOffset=*/ 0x2345,
        /*cdOffsetAddress=*/ 0x1234,
        /*dstOffset=*/ 0x3456,
      );

      expect(CalldataCopy.fromBuffer(buf)).toEqual(inst);
      expect(inst.toBuffer()).toEqual(buf);
    });

    it('Writes nothing if size is 0', async () => {
      const calldata = [new Fr(1n), new Fr(2n), new Fr(3n)];
      context = initContext({ env: initExecutionEnvironment({ calldata }) });
      context.machineState.memory.set(0, new Uint32(0)); // cdoffset
      context.machineState.memory.set(1, new Uint32(0)); // size
      context.machineState.memory.set(3, new Uint16(12)); // not overwritten

      await new CalldataCopy(/*indirect=*/ 0, /*copySize=*/ 1, /*cdOffset=*/ 0, /*dstOffset=*/ 0).execute(context);

      const actual = context.machineState.memory.get(3);
      expect(actual).toEqual(new Uint16(12));
    });

    it('Copies all calldata', async () => {
      const calldata = [new Fr(1n), new Fr(2n), new Fr(3n)];
      context = initContext({ env: initExecutionEnvironment({ calldata }) });
      context.machineState.memory.set(0, new Uint32(0)); // cdoffset
      context.machineState.memory.set(1, new Uint32(3)); // size

      await new CalldataCopy(/*indirect=*/ 0, /*copySize=*/ 1, /*cdOffset=*/ 0, /*dstOffset=*/ 0).execute(context);

      const actual = context.machineState.memory.getSlice(/*offset=*/ 0, /*size=*/ 3);
      expect(actual).toEqual([new Field(1), new Field(2), new Field(3)]);
    });

    it('Copies slice of calldata', async () => {
      const calldata = [new Fr(1n), new Fr(2n), new Fr(3n)];
      context = initContext({ env: initExecutionEnvironment({ calldata }) });
      context.machineState.memory.set(0, new Uint32(1)); // cdoffset
      context.machineState.memory.set(1, new Uint32(2)); // size

      await new CalldataCopy(/*indirect=*/ 0, /*copySize=*/ 1, /*cdOffset=*/ 0, /*dstOffset=*/ 0).execute(context);

      const actual = context.machineState.memory.getSlice(/*offset=*/ 0, /*size=*/ 2);
      expect(actual).toEqual([new Field(2), new Field(3)]);
    });

    it('Should return error when memory slice calldatacopy target is out-of-range', async () => {
      const calldata = [new Fr(1n), new Fr(2n), new Fr(3n)];
      context = initContext({ env: initExecutionEnvironment({ calldata }) });
      context.machineState.memory.set(0, new Uint32(0)); // cdStart = 0
      context.machineState.memory.set(1, new Uint32(3)); // copySize = 3

      await expect(
        new CalldataCopy(
          /*indirect=*/ 0,
          /*copySizeOffset=*/ 1,
          /*cdStartOffset=*/ 0,
          /*dstOffset=*/ TaggedMemory.MAX_MEMORY_SIZE - 2,
        ).execute(context),
      ).rejects.toThrow(MemorySliceOutOfRangeError);
    });

    it('Should pad with zeros when the calldata slice is out-of-range', async () => {
      const calldata = [new Fr(1n), new Fr(2n), new Fr(3n)];
      context = initContext({ env: initExecutionEnvironment({ calldata }) });
      context.machineState.memory.set(0, new Uint32(2)); // cdStart = 2
      context.machineState.memory.set(1, new Uint32(3)); // copySize = 3

      await new CalldataCopy(/*indirect=*/ 0, /*copySizeOffset=*/ 1, /*cdStartOffset=*/ 0, /*dstOffset=*/ 0).execute(
        context,
      );

      const actual = context.machineState.memory.getSlice(/*offset=*/ 0, /*size=*/ 3);
      expect(actual).toEqual([new Field(3), new Field(0), new Field(0)]);
    });

    it('Should charge dynamic gas', async () => {
      const calldata = [new Fr(1n), new Fr(2n), new Fr(3n)];
      context = initContext({ env: initExecutionEnvironment({ calldata }) });
      context.machineState.memory.set(0, new Uint32(0)); // cdoffset
      context.machineState.memory.set(1, new Uint32(3)); // size

      const gasBefore = context.machineState.l2GasLeft;

      await new CalldataCopy(/*indirect=*/ 0, /*copySize=*/ 1, /*cdOffset=*/ 0, /*dstOffset=*/ 0).execute(context);

      expect(context.machineState.l2GasLeft).toEqual(
        gasBefore - AVM_ADDRESSING_BASE_L2_GAS - AVM_CALLDATACOPY_BASE_L2_GAS - AVM_CALLDATACOPY_DYN_L2_GAS * 3,
      );
    });
  });

  describe('RETURNDATASIZE', () => {
    it('Should (de)serialize correctly', () => {
      const buf = Buffer.from([
        ReturndataSize.opcode, // opcode
        0x01, // indirect
        ...Buffer.from('3456', 'hex'), // dstOffset
      ]);
      const inst = new ReturndataSize(/*indirect=*/ 0x01, /*dstOffset=*/ 0x3456);

      expect(ReturndataSize.fromBuffer(buf)).toEqual(inst);
      expect(inst.toBuffer()).toEqual(buf);
    });

    it('Writes size', async () => {
      context = initContext();
      context.machineState.nestedReturndata = [new Fr(1n), new Fr(2n), new Fr(3n)];

      await new ReturndataSize(/*indirect=*/ 0, /*dstOffset=*/ 10).execute(context);

      const actual = context.machineState.memory.get(10);
      expect(actual).toEqual(new Uint32(3));
    });
  });

  describe('RETURNDATACOPY', () => {
    it('Should (de)serialize correctly', () => {
      const buf = Buffer.from([
        ReturndataCopy.opcode, // opcode
        0x10, // indirect
        ...Buffer.from('2345', 'hex'), // copysizeOffset
        ...Buffer.from('1234', 'hex'), // rdOffsetAddress
        ...Buffer.from('3456', 'hex'), // dstOffset
      ]);
      const inst = new ReturndataCopy(
        /*indirect=*/ 0x10,
        /*copysizeOffset=*/ 0x2345,
        /*cdOffsetAddress=*/ 0x1234,
        /*dstOffset=*/ 0x3456,
      );

      expect(ReturndataCopy.fromBuffer(buf)).toEqual(inst);
      expect(inst.toBuffer()).toEqual(buf);
    });

    it('Writes nothing if size is 0', async () => {
      context = initContext();
      context.machineState.nestedReturndata = [new Fr(1n), new Fr(2n), new Fr(3n)];
      context.machineState.memory.set(0, new Uint32(0)); // rdoffset
      context.machineState.memory.set(1, new Uint32(0)); // size
      context.machineState.memory.set(3, new Uint16(12)); // not overwritten

      await new ReturndataCopy(/*indirect=*/ 0, /*copySize=*/ 1, /*rdOffset=*/ 0, /*dstOffset=*/ 0).execute(context);

      const actual = context.machineState.memory.get(3);
      expect(actual).toEqual(new Uint16(12));
    });

    it('Copies all returndata', async () => {
      context = initContext();
      context.machineState.nestedReturndata = [new Fr(1n), new Fr(2n), new Fr(3n)];
      context.machineState.memory.set(0, new Uint32(0)); // rdoffset
      context.machineState.memory.set(1, new Uint32(3)); // size

      await new ReturndataCopy(/*indirect=*/ 0, /*copySize=*/ 1, /*rdOffset=*/ 0, /*dstOffset=*/ 0).execute(context);

      const actual = context.machineState.memory.getSlice(/*offset=*/ 0, /*size=*/ 3);
      expect(actual).toEqual([new Field(1), new Field(2), new Field(3)]);
    });

    it('Copies slice of returndata', async () => {
      context = initContext();
      context.machineState.nestedReturndata = [new Fr(1n), new Fr(2n), new Fr(3n)];
      context.machineState.memory.set(0, new Uint32(1)); // rdoffset
      context.machineState.memory.set(1, new Uint32(2)); // size

      await new ReturndataCopy(/*indirect=*/ 0, /*copySize=*/ 1, /*rdOffset=*/ 0, /*dstOffset=*/ 0).execute(context);

      const actual = context.machineState.memory.getSlice(/*offset=*/ 0, /*size=*/ 2);
      expect(actual).toEqual([new Field(2), new Field(3)]);
    });

    it('Should return error when memory slice target is out-of-range', async () => {
      context = initContext();
      context.machineState.nestedReturndata = [new Fr(1n), new Fr(2n), new Fr(3n)];
      context.machineState.memory.set(0, new Uint32(1)); // rdStart = 1
      context.machineState.memory.set(1, new Uint32(2)); // copySize = 2

      await expect(
        new ReturndataCopy(
          /*indirect=*/ 0,
          /*copySizeOffset=*/ 1,
          /*rdStartOffset=*/ 0,
          /*dstOffset=*/ TaggedMemory.MAX_MEMORY_SIZE - 1,
        ).execute(context),
      ).rejects.toThrow(MemorySliceOutOfRangeError);
    });

    it('Should pad with zeros when returndata slice is out-of-range', async () => {
      context = initContext();
      context.machineState.nestedReturndata = [new Fr(1n), new Fr(2n), new Fr(3n)];
      context.machineState.memory.set(0, new Uint32(2)); // rdStart = 2
      context.machineState.memory.set(1, new Uint32(3)); // copySize = 3

      await new ReturndataCopy(/*indirect=*/ 0, /*copySizeOffset=*/ 1, /*rdStartOffset=*/ 0, /*dstOffset=*/ 0).execute(
        context,
      );

      const actual = context.machineState.memory.getSlice(/*offset=*/ 0, /*size=*/ 3);
      expect(actual).toEqual([new Field(3), new Field(0), new Field(0)]);
    });

    it('Should charge dynamic gas', async () => {
      context = initContext();
      const size = 3;
      context.machineState.nestedReturndata = [new Fr(1n), new Fr(2n), new Fr(3n)];
      context.machineState.memory.set(0, new Uint32(0)); // rdoffset
      context.machineState.memory.set(1, new Uint32(size)); // size

      const gasBefore = context.machineState.l2GasLeft;
      await new ReturndataCopy(/*indirect=*/ 0, /*copySize=*/ 1, /*rdOffset=*/ 0, /*dstOffset=*/ 0).execute(context);
      expect(context.machineState.l2GasLeft).toEqual(
        gasBefore - AVM_ADDRESSING_BASE_L2_GAS - AVM_RETURNDATACOPY_BASE_L2_GAS - AVM_RETURNDATACOPY_DYN_L2_GAS * size,
      );
    });
  });
});
