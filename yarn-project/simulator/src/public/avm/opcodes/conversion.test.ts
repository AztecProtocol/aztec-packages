import { AVM_ADDRESSING_BASE_L2_GAS, AVM_TORADIXBE_BASE_L2_GAS, AVM_TORADIXBE_DYN_L2_GAS } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';

import type { AvmContext } from '../avm_context.js';
import { Field, Uint1, type Uint8, Uint32 } from '../avm_memory_types.js';
import { InvalidToRadixInputsError } from '../errors.js';
import { initContext } from '../fixtures/index.js';
import { Addressing, AddressingMode } from './addressing_mode.js';
import { MODULUS_LIMBS_PER_RADIX, ToRadixBE } from './conversion.js';

describe('Conversion Opcodes', () => {
  let context: AvmContext;

  beforeEach(async () => {
    context = initContext();
  });

  describe('To Radix BE', () => {
    it('Should (de)serialize correctly', () => {
      const buf = Buffer.from([
        ToRadixBE.opcode, // opcode
        ...Buffer.from('0001', 'hex'), // indirect
        ...Buffer.from('1234', 'hex'), // inputStateOffset
        ...Buffer.from('2345', 'hex'), // radixOffset
        ...Buffer.from('3456', 'hex'), // numLimbsOffset
        ...Buffer.from('4567', 'hex'), // outputBitsOffset
        ...Buffer.from('5678', 'hex'), // outputStateOffset
      ]);
      const inst = new ToRadixBE(
        /*indirect=*/ 0x0001,
        /*srcOffset=*/ 0x1234,
        /*radixOffset=*/ 0x2345,
        /*numLimbsOffset=*/ 0x3456,
        /*outputBitsOffset=*/ 0x4567,
        /*dstOffset=*/ 0x5678,
      );

      expect(ToRadixBE.fromBuffer(buf)).toEqual(inst);
      expect(inst.toBuffer()).toEqual(buf);
    });

    it('Should decompose correctly to bytes - direct', async () => {
      const arg = new Field(0b1011101010100n);
      const radix = new Uint32(2); // Bit decomposition
      const indirect = 0;
      const srcOffset = 0;
      const dstOffset = 20;
      const radixOffset = 1;
      const numLimbs = new Uint32(10); // only the first 10 bits
      const numLimbsOffset = 100;
      const outputBits = new Uint1(0); // false, output as bytes
      const outputBitsOffset = 200;
      context.machineState.memory.set(srcOffset, arg);
      context.machineState.memory.set(radixOffset, radix);
      context.machineState.memory.set(numLimbsOffset, numLimbs);
      context.machineState.memory.set(outputBitsOffset, outputBits);

      await new ToRadixBE(indirect, srcOffset, radixOffset, numLimbsOffset, outputBitsOffset, dstOffset).execute(
        context,
      );

      const resultBuffer: Buffer = Buffer.concat(
        context.machineState.memory.getSliceAs<Uint8>(dstOffset, numLimbs.toNumber()).map(byte => byte.toBuffer()),
      );
      // The expected result is the first 10 bits of the input
      // Reverse before slice because still only care about the first `numLimb` bytes.
      // Then reverse back since we want big endian (as the original string is).
      const expectedResults = '1011101010100'.split('').reverse().slice(0, numLimbs.toNumber()).reverse().map(Number);
      for (let i = 0; i < numLimbs.toNumber(); i++) {
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
      const numLimbs = new Uint32(10); // only the first 10 bits
      const numLimbsOffset = 100;
      const outputBits = new Uint1(1); // true, output as bits
      const outputBitsOffset = 200;
      context.machineState.memory.set(srcOffset, arg);
      context.machineState.memory.set(radixOffset, radix);
      context.machineState.memory.set(numLimbsOffset, numLimbs);
      context.machineState.memory.set(outputBitsOffset, outputBits);

      await new ToRadixBE(indirect, srcOffset, radixOffset, numLimbsOffset, outputBitsOffset, dstOffset).execute(
        context,
      );

      const resultBuffer: Buffer = Buffer.concat(
        context.machineState.memory.getSliceAs<Uint1>(dstOffset, numLimbs.toNumber()).map(byte => byte.toBuffer()),
      );
      // The expected result is the first 10 bits of the input
      // Reverse before slice because still only care about the first `numLimb` bytes.
      // Then reverse back since we want big endian (as the original string is).
      const expectedResults = '1011101010100'.split('').reverse().slice(0, numLimbs.toNumber()).reverse().map(Number);
      for (let i = 0; i < numLimbs.toNumber(); i++) {
        expect(resultBuffer.readUInt8(i)).toEqual(expectedResults[i]);
      }
    });

    it('Should decompose correctly - indirect', async () => {
      const arg = new Field(Buffer.from('1234567890abcdef', 'hex'));
      const indirect = Addressing.fromModes([
        /*srcOffset=*/ AddressingMode.INDIRECT,
        /*radixOffset*/ AddressingMode.INDIRECT,
        /*numLimbsOffset*/ AddressingMode.INDIRECT,
        /*outputBitsOffset*/ AddressingMode.INDIRECT,
        /*dstOffset*/ AddressingMode.INDIRECT,
      ]).toWire();
      const srcOffset = 0;
      const srcOffsetReal = 1000;
      const dstOffset = 2;
      const dstOffsetReal = 2000;
      const radixOffset = 3;
      const radix = new Uint32(1 << 8); // Byte decomposition
      const radixOffsetReal = 3000;
      const numLimbsOffset = 4;
      const numLimbsOffsetReal = 4000;
      const numLimbs = new Uint32(32); // 256-bit decomposition
      const outputBitsOffset = 5;
      const outputBitsOffsetReal = 5000;
      const outputBits = new Uint1(0); // false, output as bytes

      context.machineState.memory.set(srcOffset, new Uint32(srcOffsetReal));
      context.machineState.memory.set(dstOffset, new Uint32(dstOffsetReal));
      context.machineState.memory.set(radixOffset, new Uint32(radixOffsetReal));
      context.machineState.memory.set(numLimbsOffset, new Uint32(numLimbsOffsetReal));
      context.machineState.memory.set(outputBitsOffset, new Uint32(outputBitsOffsetReal));
      context.machineState.memory.set(srcOffsetReal, arg);
      context.machineState.memory.set(radixOffsetReal, radix);
      context.machineState.memory.set(numLimbsOffsetReal, numLimbs);
      context.machineState.memory.set(outputBitsOffsetReal, outputBits);

      await new ToRadixBE(indirect, srcOffset, radixOffset, numLimbsOffset, outputBitsOffset, dstOffset).execute(
        context,
      );

      const resultBuffer: Buffer = Buffer.concat(
        context.machineState.memory.getSliceAs<Uint8>(dstOffsetReal, numLimbs.toNumber()).map(byte => byte.toBuffer()),
      );
      // The expected result is the input (padded to 256 bits)
      const expectedResults = '1234567890abcdef'
        .padStart(64, '0')
        .split('')
        .map(a => parseInt(a, 16));
      // Checking the value in each byte of the buffer is correct
      for (let i = 0; i < numLimbs.toNumber(); i++) {
        // Compute the expected byte's numerical value from its two hex digits
        expect(resultBuffer.readUInt8(i)).toEqual(expectedResults[2 * i] * 16 + expectedResults[2 * i + 1]);
      }
    });

    it.each([0, 1, 257])('Should throw an error for radix equal to %s', async radix => {
      const radixOffset = 1;
      const numLimbsOffset = 100;
      const outputBitsOffset = 200;
      context.machineState.memory.set(radixOffset, new Uint32(radix));
      context.machineState.memory.set(numLimbsOffset, new Uint32(10)); //the first 10 bits
      context.machineState.memory.set(outputBitsOffset, new Uint1(1)); // true, output as bits

      await expect(
        new ToRadixBE(
          0 /*indirect*/,
          0 /*srcOffset*/,
          radixOffset,
          numLimbsOffset,
          outputBitsOffset,
          20 /*dstOffset*/,
        ).execute(context),
      ).rejects.toThrow(InvalidToRadixInputsError);
    });

    it.each([1, 2, 256, 98263423541])(
      'Should throw an error for non-zero input %s when number of limbs is zero',
      async arg => {
        const srcOffset = 0;
        const radixOffset = 1;
        const numLimbsOffset = 100;
        const outputBitsOffset = 200;
        context.machineState.memory.set(srcOffset, new Field(arg));
        context.machineState.memory.set(radixOffset, new Uint32(16));
        context.machineState.memory.set(numLimbsOffset, new Uint32(0)); // 0 number of limbs
        context.machineState.memory.set(outputBitsOffset, new Uint1(0)); // false, output as bytes

        await expect(
          new ToRadixBE(
            0 /*indirect*/,
            srcOffset,
            radixOffset,
            numLimbsOffset,
            outputBitsOffset,
            20 /*dstOffset*/,
          ).execute(context),
        ).rejects.toThrow(InvalidToRadixInputsError);
      },
    );

    it.each([3, 4, 256])(
      'Should throw an error for radix %s not equal to 2 when bit mode is activated',
      async radix => {
        const radixOffset = 1;
        const numLimbsOffset = 100;
        const outputBitsOffset = 200;
        context.machineState.memory.set(radixOffset, new Uint32(radix));
        context.machineState.memory.set(numLimbsOffset, new Uint32(4)); // 4 first bytes
        context.machineState.memory.set(outputBitsOffset, new Uint1(1)); // true, output as bit

        await expect(
          new ToRadixBE(
            0 /*indirect*/,
            0 /*srcOffset*/,
            radixOffset,
            numLimbsOffset,
            outputBitsOffset,
            20 /*dstOffset*/,
          ).execute(context),
        ).rejects.toThrow(InvalidToRadixInputsError);
      },
    );

    it('Should charge dynamic gas', async () => {
      const arg = new Field(27);
      const radix = new Uint32(256); // Byte decomposition: can need 32 limbs
      const indirect = 0;
      const srcOffset = 0;
      const dstOffset = 20;
      const radixOffset = 1;
      let numLimbs = new Uint32(40); // More limbs than needed
      const numLimbsOffset = 100;
      const outputBits = new Uint1(0); // false, output as bytes
      const outputBitsOffset = 200;
      context.machineState.memory.set(srcOffset, arg);
      context.machineState.memory.set(radixOffset, radix);
      context.machineState.memory.set(numLimbsOffset, numLimbs);
      context.machineState.memory.set(outputBitsOffset, outputBits);

      let gasBefore = context.machineState.l2GasLeft;
      const opcode = new ToRadixBE(indirect, srcOffset, radixOffset, numLimbsOffset, outputBitsOffset, dstOffset);
      await opcode.execute(context);

      // Number of limbs requested is greater than the number of limbs needed for the radix: dynamic gas is applied using number of limbs
      expect(context.machineState.l2GasLeft).toEqual(
        gasBefore -
          AVM_ADDRESSING_BASE_L2_GAS -
          AVM_TORADIXBE_BASE_L2_GAS -
          numLimbs.toNumber() * AVM_TORADIXBE_DYN_L2_GAS,
      );

      numLimbs = new Uint32(10); // Less limbs than needed
      context.machineState.memory.set(numLimbsOffset, numLimbs);
      gasBefore = context.machineState.l2GasLeft;
      await opcode.execute(context);

      // Number of limbs requested is less than the number of limbs needed for the radix: dynamic gas is applied using modulus limbs
      expect(context.machineState.l2GasLeft).toEqual(
        gasBefore -
          AVM_ADDRESSING_BASE_L2_GAS -
          AVM_TORADIXBE_BASE_L2_GAS -
          MODULUS_LIMBS_PER_RADIX[radix.toNumber()] * AVM_TORADIXBE_DYN_L2_GAS,
      );
    });
  });

  function computeModulusLimbs(radix: bigint): bigint[] {
    const limbs = [];
    let p = Fr.MODULUS;
    while (p > 0n) {
      limbs.push(p % radix);
      p = p / radix;
    }

    return limbs;
  }

  it('Should compute correctly the modulus limbs per radix', () => {
    const modulusLimbsPerRadix = [0, 0];
    for (let i = 2; i <= 256; i++) {
      modulusLimbsPerRadix.push(computeModulusLimbs(BigInt(i)).length);
    }
    expect(modulusLimbsPerRadix).toEqual(MODULUS_LIMBS_PER_RADIX);
  });
});
