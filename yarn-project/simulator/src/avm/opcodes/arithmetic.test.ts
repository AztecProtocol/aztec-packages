import { type AvmContext } from '../avm_context.js';
import { Field, TypeTag, Uint8, Uint16, Uint32, Uint64, Uint128 } from '../avm_memory_types.js';
import { initContext } from '../fixtures/index.js';
import { Opcode } from '../serialization/instruction_serialization.js';
import { Addressing, AddressingMode } from './addressing_mode.js';
import { Add, Div, FieldDiv, Mul, Sub } from './arithmetic.js';

describe('Arithmetic Instructions', () => {
  let context: AvmContext;

  beforeEach(() => {
    context = initContext();
  });

  describe('Add', () => {
    it('Should (de)serialize correctly', () => {
      const buf = Buffer.from([
        Opcode.ADD_16, // opcode
        0x01, // indirect
        ...Buffer.from('1234', 'hex'), // aOffset
        ...Buffer.from('2345', 'hex'), // bOffset
        ...Buffer.from('3456', 'hex'), // dstOffset
      ]);
      const inst = new Add(/*indirect=*/ 0x01, /*aOffset=*/ 0x1234, /*bOffset=*/ 0x2345, /*dstOffset=*/ 0x3456).as(
        Opcode.ADD_16,
        Add.wireFormat16,
      );

      expect(Add.as(Add.wireFormat16).deserialize(buf)).toEqual(inst);
      expect(inst.serialize()).toEqual(buf);
    });

    describe.each([
      [new Field(1n), new Field(2n), new Field(3n), TypeTag.FIELD],
      [new Uint8(1n), new Uint8(2n), new Uint8(3n), TypeTag.UINT8],
      [new Uint16(1n), new Uint16(2n), new Uint16(3n), TypeTag.UINT16],
      [new Uint32(1n), new Uint32(2n), new Uint32(3n), TypeTag.UINT32],
      [new Uint64(1n), new Uint64(2n), new Uint64(3n), TypeTag.UINT64],
      [new Uint128(1n), new Uint128(2n), new Uint128(3n), TypeTag.UINT128],
    ])('Should add correctly', (a, b, expected, tag) => {
      it(`${TypeTag[tag]}`, async () => {
        context.machineState.memory.set(0, a);
        context.machineState.memory.set(1, b);

        await new Add(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 2).execute(context);

        const actual = context.machineState.memory.get(2);
        expect(actual).toEqual(expected);
      });
    });

    it('Should add in relative indirect mode', async () => {
      const a = new Field(1n);
      const b = new Field(2n);

      context.machineState.memory.set(10, a);
      context.machineState.memory.set(11, b);

      context.machineState.memory.set(0, new Uint32(30)); // stack pointer
      context.machineState.memory.set(32, new Uint32(5)); // indirect

      await new Add(
        /*indirect=*/ new Addressing([
          /*aOffset*/ AddressingMode.DIRECT,
          /*bOffset*/ AddressingMode.DIRECT,
          /*dstOffset*/ AddressingMode.INDIRECT | AddressingMode.RELATIVE,
        ]).toWire(),
        /*aOffset=*/ 10,
        /*bOffset=*/ 11,
        /*dstOffset=*/ 2, // We expect the result to be stored at MEM[30 + 2] = 5
      ).execute(context);

      const actual = context.machineState.memory.get(5);
      expect(actual).toEqual(new Field(3n));
    });

    describe.each([
      [new Field((Field.MODULUS + 1n) / 2n), new Field(1n), TypeTag.FIELD],
      [new Uint8((1n << 7n) + 1n), new Uint8(2n), TypeTag.UINT8],
      [new Uint16((1n << 15n) + 1n), new Uint16(2n), TypeTag.UINT16],
      [new Uint32((1n << 31n) + 1n), new Uint32(2n), TypeTag.UINT32],
      [new Uint64((1n << 63n) + 1n), new Uint64(2n), TypeTag.UINT64],
      [new Uint128((1n << 127n) + 1n), new Uint128(2n), TypeTag.UINT128],
    ])('Should wrap around', (a, expected, tag) => {
      it(`${TypeTag[tag]}`, async () => {
        context.machineState.memory.set(0, a);

        await new Add(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 0, /*dstOffset=*/ 2).execute(context);

        const actual = context.machineState.memory.get(2);
        expect(actual).toEqual(expected);
      });
    });
  });

  describe('Sub', () => {
    it('Should (de)serialize correctly', () => {
      const buf = Buffer.from([
        Opcode.SUB_16, // opcode
        0x01, // indirect
        ...Buffer.from('1234', 'hex'), // aOffset
        ...Buffer.from('2345', 'hex'), // bOffset
        ...Buffer.from('3456', 'hex'), // dstOffset
      ]);
      const inst = new Sub(/*indirect=*/ 0x01, /*aOffset=*/ 0x1234, /*bOffset=*/ 0x2345, /*dstOffset=*/ 0x3456).as(
        Opcode.SUB_16,
        Sub.wireFormat16,
      );

      expect(Sub.as(Sub.wireFormat16).deserialize(buf)).toEqual(inst);
      expect(inst.serialize()).toEqual(buf);
    });

    describe.each([
      [new Field(200n), new Field(100n), new Field(100n), TypeTag.FIELD],
      [new Uint8(200n), new Uint8(100n), new Uint8(100n), TypeTag.UINT8],
      [new Uint16(200n), new Uint16(100n), new Uint16(100n), TypeTag.UINT16],
      [new Uint32(200n), new Uint32(100n), new Uint32(100n), TypeTag.UINT32],
      [new Uint64(200n), new Uint64(100n), new Uint64(100n), TypeTag.UINT64],
      [new Uint128(200n), new Uint128(100n), new Uint128(100n), TypeTag.UINT128],
    ])('Should subtract correctly', (a, b, expected, tag) => {
      it(`${TypeTag[tag]}`, async () => {
        context.machineState.memory.set(0, a);
        context.machineState.memory.set(1, b);

        await new Sub(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 2).execute(context);

        const actual = context.machineState.memory.get(2);
        expect(actual).toEqual(expected);
      });
    });

    describe.each([
      [
        new Field((Field.MODULUS + 1n) / 2n),
        new Field((Field.MODULUS + 1n) / 2n + 2n),
        new Field(Field.MODULUS - 2n),
        TypeTag.FIELD,
      ],
      [new Uint8(1n << 7n), new Uint8((1n << 7n) + 2n), new Uint8((1n << 8n) - 2n), TypeTag.UINT8],
      [new Uint16(1n << 15n), new Uint16((1n << 15n) + 2n), new Uint16((1n << 16n) - 2n), TypeTag.UINT16],
      [new Uint32(1n << 31n), new Uint32((1n << 31n) + 2n), new Uint32((1n << 32n) - 2n), TypeTag.UINT32],
      [new Uint64(1n << 63n), new Uint64((1n << 63n) + 2n), new Uint64((1n << 64n) - 2n), TypeTag.UINT64],
      [new Uint128(1n << 127n), new Uint128((1n << 127n) + 2n), new Uint128((1n << 128n) - 2n), TypeTag.UINT128],
    ])('Should wrap around', (a, b, expected, tag) => {
      it(`${TypeTag[tag]}`, async () => {
        context.machineState.memory.set(0, a);
        context.machineState.memory.set(1, b);

        await new Sub(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 2).execute(context);

        const actual = context.machineState.memory.get(2);
        expect(actual).toEqual(expected);
      });
    });
  });

  describe('Mul', () => {
    it('Should (de)serialize correctly', () => {
      const buf = Buffer.from([
        Opcode.MUL_16, // opcode
        0x01, // indirect
        ...Buffer.from('1234', 'hex'), // aOffset
        ...Buffer.from('2345', 'hex'), // bOffset
        ...Buffer.from('3456', 'hex'), // dstOffset
      ]);
      const inst = new Mul(/*indirect=*/ 0x01, /*aOffset=*/ 0x1234, /*bOffset=*/ 0x2345, /*dstOffset=*/ 0x3456).as(
        Opcode.MUL_16,
        Mul.wireFormat16,
      );

      expect(Mul.as(Mul.wireFormat16).deserialize(buf)).toEqual(inst);
      expect(inst.serialize()).toEqual(buf);
    });

    describe.each([
      [new Field(200n), new Field(100n), new Field(20000n), TypeTag.FIELD],
      [new Uint8(2n), new Uint8(100n), new Uint8(200n), TypeTag.UINT8],
      [new Uint16(200n), new Uint16(100n), new Uint16(20000n), TypeTag.UINT16],
      [new Uint32(200n), new Uint32(100n), new Uint32(20000n), TypeTag.UINT32],
      [new Uint64(200n), new Uint64(100n), new Uint64(20000n), TypeTag.UINT64],
      [new Uint128(200n), new Uint128(100n), new Uint128(20000n), TypeTag.UINT128],
    ])('Should multiply correctly', (a, b, expected, tag) => {
      it(`${TypeTag[tag]}`, async () => {
        context.machineState.memory.set(0, a);
        context.machineState.memory.set(1, b);

        await new Mul(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 2).execute(context);

        const actual = context.machineState.memory.get(2);
        expect(actual).toEqual(expected);
      });
    });

    describe.each([
      [new Field((Field.MODULUS + 1n) / 2n + 2n), new Field(2n), new Field(5n), TypeTag.FIELD],
      [new Uint8(1n << 7n), new Uint8(2n), new Uint8(0n), TypeTag.UINT8],
      [new Uint16(1n << 15n), new Uint16(2n), new Uint16(0n), TypeTag.UINT16],
      [new Uint32(1n << 31n), new Uint32(2n), new Uint32(0n), TypeTag.UINT32],
      [new Uint64(1n << 63n), new Uint64(2n), new Uint64(0n), TypeTag.UINT64],
      [new Uint128(1n << 127n), new Uint128(2n), new Uint128(0n), TypeTag.UINT128],
    ])('Should wrap around', (a, b, expected, tag) => {
      it(`${TypeTag[tag]}`, async () => {
        context.machineState.memory.set(0, a);
        context.machineState.memory.set(1, b);

        await new Mul(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 2).execute(context);

        const actual = context.machineState.memory.get(2);
        expect(actual).toEqual(expected);
      });
    });
  });

  describe('Div', () => {
    it('Should (de)serialize correctly', () => {
      const buf = Buffer.from([
        Opcode.DIV_16, // opcode
        0x01, // indirect
        ...Buffer.from('1234', 'hex'), // aOffset
        ...Buffer.from('2345', 'hex'), // bOffset
        ...Buffer.from('3456', 'hex'), // dstOffset
      ]);
      const inst = new Div(/*indirect=*/ 0x01, /*aOffset=*/ 0x1234, /*bOffset=*/ 0x2345, /*dstOffset=*/ 0x3456).as(
        Opcode.DIV_16,
        Div.wireFormat16,
      );

      expect(Div.as(Div.wireFormat16).deserialize(buf)).toEqual(inst);
      expect(inst.serialize()).toEqual(buf);
    });

    describe.each([
      [new Uint8(200n), new Uint8(99n), new Uint8(2n), TypeTag.UINT8],
      [new Uint16(200n), new Uint16(99n), new Uint16(2n), TypeTag.UINT16],
      [new Uint32(200n), new Uint32(99n), new Uint32(2n), TypeTag.UINT32],
      [new Uint64(200n), new Uint64(99n), new Uint64(2n), TypeTag.UINT64],
      [new Uint128(200n), new Uint128(99n), new Uint128(2n), TypeTag.UINT128],
    ])('Should divide correctly', (a, b, expected, tag) => {
      it(`${TypeTag[tag]}`, async () => {
        context.machineState.memory.set(0, a);
        context.machineState.memory.set(1, b);

        await new Div(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 2).execute(context);

        const actual = context.machineState.memory.get(2);
        expect(actual).toEqual(expected);
      });
    });
  });

  describe('FDiv', () => {
    it('Should (de)serialize correctly', () => {
      const buf = Buffer.from([
        Opcode.FDIV_16, // opcode
        0x01, // indirect
        ...Buffer.from('1234', 'hex'), // aOffset
        ...Buffer.from('2345', 'hex'), // bOffset
        ...Buffer.from('3456', 'hex'), // dstOffset
      ]);
      const inst = new FieldDiv(/*indirect=*/ 0x01, /*aOffset=*/ 0x1234, /*bOffset=*/ 0x2345, /*dstOffset=*/ 0x3456).as(
        Opcode.FDIV_16,
        FieldDiv.wireFormat16,
      );

      expect(FieldDiv.as(FieldDiv.wireFormat16).deserialize(buf)).toEqual(inst);
      expect(inst.serialize()).toEqual(buf);
    });

    it('Should perform field division', async () => {
      const a = new Field(10n);
      const b = new Field(5n);

      context.machineState.memory.set(0, a);
      context.machineState.memory.set(1, b);

      await new FieldDiv(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 2).execute(context);

      const actual = context.machineState.memory.get(2);
      expect(actual).toEqual(new Field(2));
    });
  });
});
