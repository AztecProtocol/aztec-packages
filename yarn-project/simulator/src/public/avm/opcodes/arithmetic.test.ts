import type { AvmContext } from '../avm_context.js';
import { Field, TypeTag, Uint8, Uint16, Uint32, Uint64, Uint128 } from '../avm_memory_types.js';
import { initContext } from '../fixtures/initializers.js';
import { Opcode } from '../serialization/instruction_serialization.js';
import { Addressing, AddressingMode } from './addressing_mode.js';
import { Add, Div, FieldDiv, Mul, Shl, Shr, Sub } from './arithmetic.js';

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

      expect(Add.as(Add.wireFormat16).fromBuffer(buf)).toEqual(inst);
      expect(inst.toBuffer()).toEqual(buf);
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
        /*indirect=*/ Addressing.fromModes([
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

      expect(Sub.as(Sub.wireFormat16).fromBuffer(buf)).toEqual(inst);
      expect(inst.toBuffer()).toEqual(buf);
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

      expect(Mul.as(Mul.wireFormat16).fromBuffer(buf)).toEqual(inst);
      expect(inst.toBuffer()).toEqual(buf);
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

      expect(Div.as(Div.wireFormat16).fromBuffer(buf)).toEqual(inst);
      expect(inst.toBuffer()).toEqual(buf);
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

      expect(FieldDiv.as(FieldDiv.wireFormat16).fromBuffer(buf)).toEqual(inst);
      expect(inst.toBuffer()).toEqual(buf);
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

  describe('SHR', () => {
    it('Should deserialize correctly', () => {
      const buf = Buffer.from([
        Opcode.SHR_16, // opcode
        0x01, // indirect
        ...Buffer.from('1234', 'hex'), // aOffset
        ...Buffer.from('2345', 'hex'), // bOffset
        ...Buffer.from('3456', 'hex'), // dstOffset
      ]);
      const inst = new Shr(/*indirect=*/ 0x01, /*aOffset=*/ 0x1234, /*bOffset=*/ 0x2345, /*dstOffset=*/ 0x3456).as(
        Opcode.SHR_16,
        Shr.wireFormat16,
      );

      expect(Shr.as(Shr.wireFormat16).fromBuffer(buf)).toEqual(inst);
      expect(inst.toBuffer()).toEqual(buf);
    });

    it('Should require shift amount to be the same type as the LHS', async () => {
      const a = new Uint32(0b11111110010011100100n);
      const b = new Uint8(0n);

      context.machineState.memory.set(0, a);
      context.machineState.memory.set(1, b);

      await expect(
        async () => await new Shr(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 2).execute(context),
      ).rejects.toThrow(/got UINT8, expected UINT32/);
    });

    it('Should shift correctly 0 positions over integral types', async () => {
      const a = new Uint32(0b11111110010011100100n);
      const b = new Uint32(0n);

      context.machineState.memory.set(0, a);
      context.machineState.memory.set(1, b);

      await new Shr(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 2).execute(context);

      const expected = a;
      const actual = context.machineState.memory.get(2);
      expect(actual).toEqual(expected);
    });

    it('Should shift correctly 2 positions over integral types', async () => {
      const a = new Uint32(0b11111110010011100100n);
      const b = new Uint32(2n);

      context.machineState.memory.set(0, a);
      context.machineState.memory.set(1, b);

      await new Shr(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 2).execute(context);

      const expected = new Uint32(0b00111111100100111001n);
      const actual = context.machineState.memory.get(2);
      expect(actual).toEqual(expected);
    });

    it('Should shift correctly 19 positions over integral types', async () => {
      const a = new Uint32(0b11111110010011100100n);
      const b = new Uint32(19n);

      context.machineState.memory.set(0, a);
      context.machineState.memory.set(1, b);

      await new Shr(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 2).execute(context);

      const expected = new Uint32(0b01n);
      const actual = context.machineState.memory.get(2);
      expect(actual).toEqual(expected);
    });
  });

  describe('SHL', () => {
    it('Should deserialize correctly', () => {
      const buf = Buffer.from([
        Opcode.SHL_16, // opcode
        0x01, // indirect
        ...Buffer.from('1234', 'hex'), // aOffset
        ...Buffer.from('2345', 'hex'), // bOffset
        ...Buffer.from('3456', 'hex'), // dstOffset
      ]);
      const inst = new Shl(/*indirect=*/ 0x01, /*aOffset=*/ 0x1234, /*bOffset=*/ 0x2345, /*dstOffset=*/ 0x3456).as(
        Opcode.SHL_16,
        Shl.wireFormat16,
      );

      expect(Shl.as(Shl.wireFormat16).fromBuffer(buf)).toEqual(inst);
      expect(inst.toBuffer()).toEqual(buf);
    });

    it('Should require shift amount to be the same type as the LHS', async () => {
      const a = new Uint32(0b11111110010011100100n);
      const b = new Uint8(0n);

      context.machineState.memory.set(0, a);
      context.machineState.memory.set(1, b);

      await expect(
        async () => await new Shl(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 2).execute(context),
      ).rejects.toThrow(/got UINT8, expected UINT32/);
    });

    it('Should shift correctly 0 positions over integral types', async () => {
      const a = new Uint32(0b11111110010011100100n);
      const b = new Uint32(0n);

      context.machineState.memory.set(0, a);
      context.machineState.memory.set(1, b);

      await new Shl(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 2).execute(context);

      const expected = a;
      const actual = context.machineState.memory.get(2);
      expect(actual).toEqual(expected);
    });

    it('Should shift correctly 2 positions over integral types', async () => {
      const a = new Uint32(0b11111110010011100100n);
      const b = new Uint32(2n);

      context.machineState.memory.set(0, a);
      context.machineState.memory.set(1, b);

      await new Shl(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 2).execute(context);

      const expected = new Uint32(0b1111111001001110010000n);
      const actual = context.machineState.memory.get(2);
      expect(actual).toEqual(expected);
    });

    it('Should shift correctly over bit limit over integral types', async () => {
      const a = new Uint16(0b1110010011100111n);
      const b = new Uint16(17n);

      context.machineState.memory.set(0, a);
      context.machineState.memory.set(1, b);

      await new Shl(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 2).execute(context);

      const expected = new Uint16(0n);
      const actual = context.machineState.memory.get(2);
      expect(actual).toEqual(expected);
    });

    it('Should truncate when shifting over bit size over integral types', async () => {
      const a = new Uint16(0b1110010011100111n);
      const b = new Uint16(2n);

      context.machineState.memory.set(0, a);
      context.machineState.memory.set(1, b);

      await new Shl(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 2).execute(context);

      const expected = new Uint16(0b1001001110011100n);
      const actual = context.machineState.memory.get(2);
      expect(actual).toEqual(expected);
    });

    it('Should handle huge shift amounts without error (returns 0)', async () => {
      const a = new Uint32((1n << 32n) - 1n);
      const hugeShift = new Uint32(1n << 31n); // Very large shift amount

      context.machineState.memory.set(0, a);
      context.machineState.memory.set(1, hugeShift);

      await new Shl(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 2).execute(context);

      const expected = new Uint32(0n);
      const actual = context.machineState.memory.get(2);
      expect(actual).toEqual(expected);
    });

    it('Should handle maximum possible shift amount for each type', async () => {
      // Test Uint8
      const a8 = new Uint8((1n << 8n) - 1n);
      const maxShift8 = new Uint8((1n << 8n) - 1n); // Max value for Uint8
      context.machineState.memory.set(0, a8);
      context.machineState.memory.set(1, maxShift8);
      await new Shl(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 2).execute(context);
      expect(context.machineState.memory.get(2)).toEqual(new Uint8(0n));

      // Test Uint16
      const a16 = new Uint16((1n << 16n) - 1n);
      const maxShift16 = new Uint16((1n << 16n) - 1n); // Max value for Uint16
      context.machineState.memory.set(10, a16);
      context.machineState.memory.set(11, maxShift16);
      await new Shl(/*indirect=*/ 0, /*aOffset=*/ 10, /*bOffset=*/ 11, /*dstOffset=*/ 12).execute(context);
      expect(context.machineState.memory.get(12)).toEqual(new Uint16(0n));

      // Test Uint32
      const a32 = new Uint32((1n << 32n) - 1n);
      const maxShift32 = new Uint32((1n << 32n) - 1n); // Max value for Uint32
      context.machineState.memory.set(20, a32);
      context.machineState.memory.set(21, maxShift32);
      await new Shl(/*indirect=*/ 0, /*aOffset=*/ 20, /*bOffset=*/ 21, /*dstOffset=*/ 22).execute(context);
      expect(context.machineState.memory.get(22)).toEqual(new Uint32(0n));
    });
  });

  describe('SHR huge shift amounts', () => {
    it('Should handle huge shift amounts without error (returns 0)', async () => {
      const a = new Uint32((1n << 32n) - 1n);
      const hugeShift = new Uint32(1n << 31n); // Very large shift amount

      context.machineState.memory.set(0, a);
      context.machineState.memory.set(1, hugeShift);

      await new Shr(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 2).execute(context);

      const expected = new Uint32(0n);
      const actual = context.machineState.memory.get(2);
      expect(actual).toEqual(expected);
    });

    it('Should handle maximum possible shift amount for each type', async () => {
      // Test Uint8
      const a8 = new Uint8((1n << 8n) - 1n);
      const maxShift8 = new Uint8((1n << 8n) - 1n); // Max value for Uint8
      context.machineState.memory.set(0, a8);
      context.machineState.memory.set(1, maxShift8);
      await new Shr(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 2).execute(context);
      expect(context.machineState.memory.get(2)).toEqual(new Uint8(0n));

      // Test Uint16
      const a16 = new Uint16((1n << 16n) - 1n);
      const maxShift16 = new Uint16((1n << 16n) - 1n); // Max value for Uint16
      context.machineState.memory.set(10, a16);
      context.machineState.memory.set(11, maxShift16);
      await new Shr(/*indirect=*/ 0, /*aOffset=*/ 10, /*bOffset=*/ 11, /*dstOffset=*/ 12).execute(context);
      expect(context.machineState.memory.get(12)).toEqual(new Uint16(0n));

      // Test Uint32
      const a32 = new Uint32((1n << 32n) - 1n);
      const maxShift32 = new Uint32((1n << 32n) - 1n); // Max value for Uint32
      context.machineState.memory.set(20, a32);
      context.machineState.memory.set(21, maxShift32);
      await new Shr(/*indirect=*/ 0, /*aOffset=*/ 20, /*bOffset=*/ 21, /*dstOffset=*/ 22).execute(context);
      expect(context.machineState.memory.get(22)).toEqual(new Uint32(0n));

      // Test Uint64
      const a64 = new Uint64((1n << 64n) - 1n);
      const maxShift64 = new Uint64((1n << 64n) - 1n); // Max value for Uint64
      context.machineState.memory.set(30, a64);
      context.machineState.memory.set(31, maxShift64);
      await new Shr(/*indirect=*/ 0, /*aOffset=*/ 30, /*bOffset=*/ 31, /*dstOffset=*/ 32).execute(context);
      expect(context.machineState.memory.get(32)).toEqual(new Uint64(0n));

      // Test Uint128
      const a128 = new Uint128((1n << 128n) - 1n);
      const maxShift128 = new Uint128((1n << 128n) - 1n); // Max value for Uint128
      context.machineState.memory.set(40, a128);
      context.machineState.memory.set(41, maxShift128);
      await new Shr(/*indirect=*/ 0, /*aOffset=*/ 40, /*bOffset=*/ 41, /*dstOffset=*/ 42).execute(context);
      expect(context.machineState.memory.get(42)).toEqual(new Uint128(0n));
    });

    it('Should handle shift amount exactly at bit size boundary', async () => {
      // Test shifting by exact bit size should return 0
      const a32 = new Uint32((1n << 32n) - 1n);
      const exactBitSize = new Uint32(32n); // Exact bit size of Uint32

      context.machineState.memory.set(0, a32);
      context.machineState.memory.set(1, exactBitSize);

      await new Shr(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 2).execute(context);

      const expected = new Uint32(0n);
      const actual = context.machineState.memory.get(2);
      expect(actual).toEqual(expected);
    });

    it('Should handle shift amount just below bit size boundary', async () => {
      // Test shifting by bit size - 1 should leave 1 bit
      const a32 = new Uint32((1n << 32n) - 1n);
      const justBelowBitSize = new Uint32(31n); // One less than bit size

      context.machineState.memory.set(0, a32);
      context.machineState.memory.set(1, justBelowBitSize);

      await new Shr(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 2).execute(context);

      const expected = new Uint32(1n); // Only the MSB remains
      const actual = context.machineState.memory.get(2);
      expect(actual).toEqual(expected);
    });
  });
});
