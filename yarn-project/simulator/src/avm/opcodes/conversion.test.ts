import { type AvmContext } from '../avm_context.js';
import { Field, type Uint1, type Uint8, Uint32 } from '../avm_memory_types.js';
import { initContext } from '../fixtures/index.js';
import { Addressing, AddressingMode } from './addressing_mode.js';
import { ToRadixBE } from './conversion.js';

describe('Conversion Opcodes', () => {
  let context: AvmContext;

  beforeEach(async () => {
    context = initContext();
  });

  describe('To Radix BE', () => {
    it('Should (de)serialize correctly', () => {
      const buf = Buffer.from([
        ToRadixBE.opcode, // opcode
        1, // indirect
        ...Buffer.from('1234', 'hex'), // inputStateOffset
        ...Buffer.from('2345', 'hex'), // outputStateOffset
        ...Buffer.from('3456', 'hex'), // radixOffset
        ...Buffer.from('0100', 'hex'), // numLimbs
        ...Buffer.from('01', 'hex'), // outputBits
      ]);
      const inst = new ToRadixBE(
        /*indirect=*/ 1,
        /*srcOffset=*/ 0x1234,
        /*dstOffset=*/ 0x2345,
        /*radixOffset=*/ 0x3456,
        /*numLimbs=*/ 256,
        /*outputBits=*/ 1,
      );

      expect(ToRadixBE.deserialize(buf)).toEqual(inst);
      expect(inst.serialize()).toEqual(buf);
    });

    it('Should decompose correctly to bytes - direct', async () => {
      const arg = new Field(0b1011101010100n);
      const radix = new Uint32(2); // Bit decomposition
      const indirect = 0;
      const srcOffset = 0;
      const dstOffset = 20;
      const radixOffset = 1;
      const numLimbs = 10; // only the first 10 bits
      const outputBits = 0; // false, output as bytes
      context.machineState.memory.set(srcOffset, arg);
      context.machineState.memory.set(radixOffset, radix);

      await new ToRadixBE(indirect, srcOffset, dstOffset, radixOffset, numLimbs, outputBits).execute(context);

      const resultBuffer: Buffer = Buffer.concat(
        context.machineState.memory.getSliceAs<Uint8>(dstOffset, numLimbs).map(byte => byte.toBuffer()),
      );
      // The expected result is the first 10 bits of the input
      // Reverse before slice because still only care about the first `numLimb` bytes.
      // Then reverse back since we want big endian (as the original string is).
      const expectedResults = '1011101010100'.split('').reverse().slice(0, numLimbs).reverse().map(Number);
      for (let i = 0; i < numLimbs; i++) {
        expect(resultBuffer.readUInt8(i)).toEqual(expectedResults[i]);
      }
    });

    it('Should decompose correctly to bits - direct', async () => {
      const arg = new Field(0b1011101010100n);
      const radix = new Uint32(2); // Bit decomposition
      const indirect = 0;
      const srcOffset = 0;
      const dstOffset = 20;
      const radixOffset = 1;
      const numLimbs = 10; // only the first 10 bits
      const outputBits = 1; // true, output as bits
      context.machineState.memory.set(srcOffset, arg);
      context.machineState.memory.set(radixOffset, radix);

      await new ToRadixBE(indirect, srcOffset, dstOffset, radixOffset, numLimbs, outputBits).execute(context);

      const resultBuffer: Buffer = Buffer.concat(
        context.machineState.memory.getSliceAs<Uint1>(dstOffset, numLimbs).map(byte => byte.toBuffer()),
      );
      // The expected result is the first 10 bits of the input
      // Reverse before slice because still only care about the first `numLimb` bytes.
      // Then reverse back since we want big endian (as the original string is).
      const expectedResults = '1011101010100'.split('').reverse().slice(0, numLimbs).reverse().map(Number);
      for (let i = 0; i < numLimbs; i++) {
        expect(resultBuffer.readUInt8(i)).toEqual(expectedResults[i]);
      }
    });

    it('Should decompose correctly - indirect', async () => {
      const arg = new Field(Buffer.from('1234567890abcdef', 'hex'));
      const indirect = new Addressing([
        /*srcOffset=*/ AddressingMode.INDIRECT,
        /*dstOffset*/ AddressingMode.INDIRECT,
        /*radixOffset*/ AddressingMode.INDIRECT,
      ]).toWire();
      const srcOffset = 0;
      const srcOffsetReal = 10;
      const dstOffset = 2;
      const dstOffsetReal = 30;
      const radixOffset = 3;
      const radix = new Uint32(1 << 8); // Byte decomposition
      const radixOffsetReal = 50;

      context.machineState.memory.set(srcOffset, new Uint32(srcOffsetReal));
      context.machineState.memory.set(dstOffset, new Uint32(dstOffsetReal));
      context.machineState.memory.set(radixOffset, new Uint32(radixOffsetReal));
      context.machineState.memory.set(srcOffsetReal, arg);
      context.machineState.memory.set(radixOffsetReal, radix);

      const numLimbs = 32; // 256-bit decomposition
      const outputBits = 0; // false, output as bytes
      await new ToRadixBE(indirect, srcOffset, dstOffset, radixOffset, numLimbs, outputBits).execute(context);

      const resultBuffer: Buffer = Buffer.concat(
        context.machineState.memory.getSliceAs<Uint8>(dstOffsetReal, numLimbs).map(byte => byte.toBuffer()),
      );
      // The expected result is the input (padded to 256 bits)
      const expectedResults = '1234567890abcdef'
        .padStart(64, '0')
        .split('')
        .map(a => parseInt(a, 16));
      // Checking the value in each byte of the buffer is correct
      for (let i = 0; i < numLimbs; i++) {
        // Compute the expected byte's numerical value from its two hex digits
        expect(resultBuffer.readUInt8(i)).toEqual(expectedResults[2 * i] * 16 + expectedResults[2 * i + 1]);
      }
    });
  });
});
