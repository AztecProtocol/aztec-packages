import { AVM_AND_BASE_L2_GAS, AVM_BITWISE_DYN_L2_GAS, AVM_OR_BASE_L2_GAS, AVM_XOR_BASE_L2_GAS } from '@aztec/constants';

import type { AvmContext } from '../avm_context.js';
import { getBitwiseDynamicGasMultiplier } from '../avm_gas.js';
import { TypeTag, Uint8, Uint16, Uint32 } from '../avm_memory_types.js';
import { initContext } from '../fixtures/index.js';
import { Opcode } from '../serialization/instruction_serialization.js';
import { And, Not, Or, Shl, Shr, Xor } from './bitwise.js';

describe('Bitwise instructions', () => {
  let context: AvmContext;

  beforeEach(() => {
    context = initContext();
  });

  describe('AND', () => {
    it('Should deserialize correctly', () => {
      const buf = Buffer.from([
        Opcode.AND_16, // opcode
        0x01, // indirect
        ...Buffer.from('1234', 'hex'), // aOffset
        ...Buffer.from('2345', 'hex'), // bOffset
        ...Buffer.from('3456', 'hex'), // dstOffset
      ]);
      const inst = new And(/*indirect=*/ 0x01, /*aOffset=*/ 0x1234, /*bOffset=*/ 0x2345, /*dstOffset=*/ 0x3456).as(
        Opcode.AND_16,
        And.wireFormat16,
      );

      expect(And.as(And.wireFormat16).fromBuffer(buf)).toEqual(inst);
      expect(inst.toBuffer()).toEqual(buf);
    });

    it('Should AND correctly over integral types', async () => {
      context.machineState.memory.set(0, new Uint32(0b11111110010011100100n));
      context.machineState.memory.set(1, new Uint32(0b11100100111001001111n));

      await new And(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 2).execute(context);

      const actual = context.machineState.memory.get(2);
      expect(actual).toEqual(new Uint32(0b11100100010001000100n));
    });

    it('Should charge dynamic gas', async () => {
      context.machineState.memory.set(0, new Uint32(0b11111110010011100100n));
      context.machineState.memory.set(1, new Uint32(0b11100100111001001111n));

      const gasBefore = context.machineState.l2GasLeft;
      await new And(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 2).execute(context);

      expect(context.machineState.l2GasLeft).toEqual(
        gasBefore - AVM_AND_BASE_L2_GAS - AVM_BITWISE_DYN_L2_GAS * getBitwiseDynamicGasMultiplier(TypeTag.UINT32),
      );
    });
  });

  describe('OR', () => {
    it('Should deserialize correctly', () => {
      const buf = Buffer.from([
        Opcode.OR_16, // opcode
        0x01, // indirect
        ...Buffer.from('1234', 'hex'), // aOffset
        ...Buffer.from('2345', 'hex'), // bOffset
        ...Buffer.from('3456', 'hex'), // dstOffset
      ]);
      const inst = new Or(/*indirect=*/ 0x01, /*aOffset=*/ 0x1234, /*bOffset=*/ 0x2345, /*dstOffset=*/ 0x3456).as(
        Opcode.OR_16,
        Or.wireFormat16,
      );

      expect(Or.as(Or.wireFormat16).fromBuffer(buf)).toEqual(inst);
      expect(inst.toBuffer()).toEqual(buf);
    });

    it('Should OR correctly over integral types', async () => {
      const a = new Uint32(0b11111110010011100100n);
      const b = new Uint32(0b11100100111001001111n);

      context.machineState.memory.set(0, a);
      context.machineState.memory.set(1, b);

      await new Or(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 2).execute(context);

      const expected = new Uint32(0b11111110111011101111n);
      const actual = context.machineState.memory.get(2);
      expect(actual).toEqual(expected);
    });

    it('Should charge dynamic gas', async () => {
      const a = new Uint32(0b11111110010011100100n);
      const b = new Uint32(0b11100100111001001111n);

      context.machineState.memory.set(0, a);
      context.machineState.memory.set(1, b);

      const gasBefore = context.machineState.l2GasLeft;
      await new Or(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 2).execute(context);

      expect(context.machineState.l2GasLeft).toEqual(
        gasBefore - AVM_OR_BASE_L2_GAS - AVM_BITWISE_DYN_L2_GAS * getBitwiseDynamicGasMultiplier(TypeTag.UINT32),
      );
    });
  });

  describe('XOR', () => {
    it('Should deserialize correctly', () => {
      const buf = Buffer.from([
        Opcode.XOR_16, // opcode
        0x01, // indirect
        ...Buffer.from('1234', 'hex'), // aOffset
        ...Buffer.from('2345', 'hex'), // bOffset
        ...Buffer.from('3456', 'hex'), // dstOffset
      ]);
      const inst = new Xor(/*indirect=*/ 0x01, /*aOffset=*/ 0x1234, /*bOffset=*/ 0x2345, /*dstOffset=*/ 0x3456).as(
        Opcode.XOR_16,
        Xor.wireFormat16,
      );

      expect(Xor.as(Xor.wireFormat16).fromBuffer(buf)).toEqual(inst);
      expect(inst.toBuffer()).toEqual(buf);
    });

    it('Should XOR correctly over integral types', async () => {
      const a = new Uint32(0b11111110010011100100n);
      const b = new Uint32(0b11100100111001001111n);

      context.machineState.memory.set(0, a);
      context.machineState.memory.set(1, b);

      await new Xor(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 2).execute(context);

      const expected = new Uint32(0b00011010101010101011n);
      const actual = context.machineState.memory.get(2);
      expect(actual).toEqual(expected);
    });

    it('Should charge dynamic gas', async () => {
      const a = new Uint32(0b11111110010011100100n);
      const b = new Uint32(0b11100100111001001111n);

      context.machineState.memory.set(0, a);
      context.machineState.memory.set(1, b);

      const gasBefore = context.machineState.l2GasLeft;
      await new Xor(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 2).execute(context);

      expect(context.machineState.l2GasLeft).toEqual(
        gasBefore - AVM_XOR_BASE_L2_GAS - AVM_BITWISE_DYN_L2_GAS * getBitwiseDynamicGasMultiplier(TypeTag.UINT32),
      );
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

    it('Should require shift amount to be U8', async () => {
      const a = new Uint32(0b11111110010011100100n);
      const b = new Uint32(0n);

      context.machineState.memory.set(0, a);
      context.machineState.memory.set(1, b);

      await expect(
        async () => await new Shr(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 2).execute(context),
      ).rejects.toThrow(/got UINT32, expected UINT8/);
    });

    it('Should shift correctly 0 positions over integral types', async () => {
      const a = new Uint32(0b11111110010011100100n);
      const b = new Uint8(0n);

      context.machineState.memory.set(0, a);
      context.machineState.memory.set(1, b);

      await new Shr(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 2).execute(context);

      const expected = a;
      const actual = context.machineState.memory.get(2);
      expect(actual).toEqual(expected);
    });

    it('Should shift correctly 2 positions over integral types', async () => {
      const a = new Uint32(0b11111110010011100100n);
      const b = new Uint8(2n);

      context.machineState.memory.set(0, a);
      context.machineState.memory.set(1, b);

      await new Shr(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 2).execute(context);

      const expected = new Uint32(0b00111111100100111001n);
      const actual = context.machineState.memory.get(2);
      expect(actual).toEqual(expected);
    });

    it('Should shift correctly 19 positions over integral types', async () => {
      const a = new Uint32(0b11111110010011100100n);
      const b = new Uint8(19n);

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

    it('Should require shift amount to be U8', async () => {
      const a = new Uint32(0b11111110010011100100n);
      const b = new Uint32(0n);

      context.machineState.memory.set(0, a);
      context.machineState.memory.set(1, b);

      await expect(
        async () => await new Shl(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 2).execute(context),
      ).rejects.toThrow(/got UINT32, expected UINT8/);
    });

    it('Should shift correctly 0 positions over integral types', async () => {
      const a = new Uint32(0b11111110010011100100n);
      const b = new Uint8(0n);

      context.machineState.memory.set(0, a);
      context.machineState.memory.set(1, b);

      await new Shl(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 2).execute(context);

      const expected = a;
      const actual = context.machineState.memory.get(2);
      expect(actual).toEqual(expected);
    });

    it('Should shift correctly 2 positions over integral types', async () => {
      const a = new Uint32(0b11111110010011100100n);
      const b = new Uint8(2n);

      context.machineState.memory.set(0, a);
      context.machineState.memory.set(1, b);

      await new Shl(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 2).execute(context);

      const expected = new Uint32(0b1111111001001110010000n);
      const actual = context.machineState.memory.get(2);
      expect(actual).toEqual(expected);
    });

    it('Should shift correctly over bit limit over integral types', async () => {
      const a = new Uint16(0b1110010011100111n);
      const b = new Uint8(17n);

      context.machineState.memory.set(0, a);
      context.machineState.memory.set(1, b);

      await new Shl(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 2).execute(context);

      const expected = new Uint16(0n);
      const actual = context.machineState.memory.get(2);
      expect(actual).toEqual(expected);
    });

    it('Should truncate when shifting over bit size over integral types', async () => {
      const a = new Uint16(0b1110010011100111n);
      const b = new Uint8(2n);

      context.machineState.memory.set(0, a);
      context.machineState.memory.set(1, b);

      await new Shl(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 2).execute(context);

      const expected = new Uint16(0b1001001110011100n);
      const actual = context.machineState.memory.get(2);
      expect(actual).toEqual(expected);
    });
  });

  describe('NOT', () => {
    it('Should (de)serialize correctly', () => {
      const buf = Buffer.from([
        Opcode.NOT_16, // opcode
        0x01, // indirect
        ...Buffer.from('1234', 'hex'), // aOffset
        ...Buffer.from('3456', 'hex'), // dstOffset
      ]);
      const inst = new Not(/*indirect=*/ 0x01, /*aOffset=*/ 0x1234, /*dstOffset=*/ 0x3456).as(
        Opcode.NOT_16,
        Not.wireFormat16,
      );

      expect(Not.as(Not.wireFormat16).fromBuffer(buf)).toEqual(inst);
      expect(inst.toBuffer()).toEqual(buf);
    });

    it('Should NOT correctly over integral types', async () => {
      const a = new Uint16(0b0110010011100100n);

      context.machineState.memory.set(0, a);

      await new Not(/*indirect=*/ 0, /*aOffset=*/ 0, /*dstOffset=*/ 1).execute(context);

      const expected = new Uint16(0b1001101100011011n); // high bits!
      const actual = context.machineState.memory.get(1);
      expect(actual).toEqual(expected);
    });
  });
});
