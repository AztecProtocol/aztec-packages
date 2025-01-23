import { keccakf1600, sha256Compression } from '@aztec/foundation/crypto';

import { type AvmContext } from '../avm_context.js';
import { Field, TaggedMemory, Uint32, Uint64 } from '../avm_memory_types.js';
import { MemorySliceOutOfRangeError } from '../errors.js';
import { initContext, randomMemoryUint32s } from '../fixtures/index.js';
import { Addressing, AddressingMode } from './addressing_mode.js';
import { KeccakF1600, Poseidon2, Sha256Compression } from './hashing.js';

describe('Hashing Opcodes', () => {
  let context: AvmContext;

  beforeEach(async () => {
    context = initContext();
  });

  describe('Poseidon2', () => {
    it('Should (de)serialize correctly', () => {
      const buf = Buffer.from([
        Poseidon2.opcode, // opcode
        1, // indirect
        ...Buffer.from('1234', 'hex'), // inputStateOffset
        ...Buffer.from('2345', 'hex'), // outputStateOffset
      ]);
      const inst = new Poseidon2(/*indirect=*/ 1, /*dstOffset=*/ 0x1234, /*messageOffset=*/ 0x2345);

      expect(Poseidon2.deserialize(buf)).toEqual(inst);
      expect(inst.serialize()).toEqual(buf);
    });

    it('Should hash correctly - direct', async () => {
      const indirect = 0;
      const inputState = [new Field(1n), new Field(2n), new Field(3n), new Field(4n)];
      const inputStateOffset = 0;
      const outputStateOffset = 0;
      context.machineState.memory.setSlice(inputStateOffset, inputState);

      await new Poseidon2(indirect, inputStateOffset, outputStateOffset).execute(context);

      const result = context.machineState.memory.getSlice(outputStateOffset, 4);
      expect(result).toEqual([
        new Field(0x224785a48a72c75e2cbb698143e71d5d41bd89a2b9a7185871e39a54ce5785b1n),
        new Field(0x225bb800db22c4f4b09ace45cb484d42b0dd7dfe8708ee26aacde6f2c1fb2cb8n),
        new Field(0x1180f4260e60b4264c987b503075ea8374b53ed06c5145f8c21c2aadb5087d21n),
        new Field(0x16c877b5b9c04d873218804ccbf65d0eeb12db447f66c9ca26fec380055df7e9n),
      ]);
    });

    it('Should hash correctly - indirect', async () => {
      const indirect = new Addressing([AddressingMode.INDIRECT, AddressingMode.INDIRECT]).toWire();
      const inputState = [new Field(1n), new Field(2n), new Field(3n), new Field(4n)];
      const inputStateOffset = 0;
      const inputStateOffsetReal = 10;
      const outputStateOffset = 0;
      const outputStateOffsetReal = 10;
      context.machineState.memory.set(inputStateOffset, new Uint32(inputStateOffsetReal));
      context.machineState.memory.setSlice(inputStateOffsetReal, inputState);

      await new Poseidon2(indirect, inputStateOffset, outputStateOffset).execute(context);

      const result = context.machineState.memory.getSlice(outputStateOffsetReal, 4);
      expect(result).toEqual([
        new Field(0x224785a48a72c75e2cbb698143e71d5d41bd89a2b9a7185871e39a54ce5785b1n),
        new Field(0x225bb800db22c4f4b09ace45cb484d42b0dd7dfe8708ee26aacde6f2c1fb2cb8n),
        new Field(0x1180f4260e60b4264c987b503075ea8374b53ed06c5145f8c21c2aadb5087d21n),
        new Field(0x16c877b5b9c04d873218804ccbf65d0eeb12db447f66c9ca26fec380055df7e9n),
      ]);
    });

    it('Should throw an error when input state offsets are out of range.', async () => {
      const indirect = 0;
      const inputStateOffset = TaggedMemory.MAX_MEMORY_SIZE - 3;
      const outputStateOffset = 0;

      await expect(new Poseidon2(indirect, inputStateOffset, outputStateOffset).execute(context)).rejects.toThrow(
        MemorySliceOutOfRangeError,
      );
    });

    it('Should throw an error when output state offsets are out of range.', async () => {
      const indirect = 0;
      const inputStateOffset = 0;
      const outputStateOffset = TaggedMemory.MAX_MEMORY_SIZE - 1;

      await expect(new Poseidon2(indirect, inputStateOffset, outputStateOffset).execute(context)).rejects.toThrow(
        MemorySliceOutOfRangeError,
      );
    });
  });

  describe('Keccakf1600', () => {
    it('Should (de)serialize correctly', () => {
      const buf = Buffer.from([
        KeccakF1600.opcode, // opcode
        1, // indirect
        ...Buffer.from('1234', 'hex'), // dstOffset
        ...Buffer.from('2345', 'hex'), // inputOffset
      ]);
      const inst = new KeccakF1600(/*indirect=*/ 1, /*dstOffset=*/ 0x1234, /*inputOffset=*/ 0x2345);

      expect(KeccakF1600.deserialize(buf)).toEqual(inst);
      expect(inst.serialize()).toEqual(buf);
    });

    it('Should permute correctly - direct', async () => {
      const rawArgs = [...Array(25)].map(_ => 0n);
      const args = rawArgs.map(a => new Uint64(a));
      const indirect = 0;
      const messageOffset = 0;
      const dstOffset = 100;
      context.machineState.memory.setSlice(messageOffset, args);

      await new KeccakF1600(indirect, dstOffset, messageOffset).execute(context);

      const result = context.machineState.memory.getSliceAs<Uint64>(dstOffset, 25);
      expect(result).toEqual(keccakf1600(rawArgs).map(a => new Uint64(a)));
    });

    it('Should throw an error when message input offsets are out of range.', async () => {
      const indirect = 0;
      const messageOffset = TaggedMemory.MAX_MEMORY_SIZE - 24;
      const dstOffset = 200;

      await expect(new KeccakF1600(indirect, dstOffset, messageOffset).execute(context)).rejects.toThrow(
        MemorySliceOutOfRangeError,
      );
    });

    it('Should throw an error when destination offsets are out of range.', async () => {
      const rawArgs = [...Array(25)].map(_ => 0n);
      const args = rawArgs.map(a => new Uint64(a));
      const indirect = 0;
      const messageOffset = 0;
      const dstOffset = TaggedMemory.MAX_MEMORY_SIZE - 24;
      context.machineState.memory.setSlice(messageOffset, args);

      await expect(new KeccakF1600(indirect, dstOffset, messageOffset).execute(context)).rejects.toThrow(
        MemorySliceOutOfRangeError,
      );
    });
  });

  describe('Sha256Compression', () => {
    it('Should (de)serialize correctly', () => {
      const buf = Buffer.from([
        Sha256Compression.opcode, // opcode
        1, // indirect
        ...Buffer.from('1234', 'hex'), // dstOffset
        ...Buffer.from('2345', 'hex'), // stateOffset
        ...Buffer.from('4567', 'hex'), // inputsOffset
      ]);
      const inst = new Sha256Compression(
        /*indirect=*/ 1,
        /*dstOffset=*/ 0x1234,
        /*stateOffset=*/ 0x2345,
        /*inputsOffset=*/ 0x4567,
      );

      expect(Sha256Compression.deserialize(buf)).toEqual(inst);
      expect(inst.serialize()).toEqual(buf);
    });

    it('Should hash correctly - direct', async () => {
      const state = randomMemoryUint32s(8);
      const stateArray = Uint32Array.from(state.map(byte => byte.toNumber()));
      const inputs = randomMemoryUint32s(16);
      const inputsArray = Uint32Array.from(inputs.map(byte => byte.toNumber()));
      const indirect = 0;
      const stateOffset = 0;
      const stateSizeOffset = 100;
      const inputsOffset = 200;
      const inputsSizeOffset = 300;
      const outputOffset = 300;
      context.machineState.memory.set(stateSizeOffset, new Uint32(state.length));
      context.machineState.memory.setSlice(stateOffset, state);
      context.machineState.memory.set(inputsSizeOffset, new Uint32(inputs.length));
      context.machineState.memory.setSlice(inputsOffset, inputs);

      await new Sha256Compression(indirect, outputOffset, stateOffset, inputsOffset).execute(context);

      const output = context.machineState.memory.getSliceAs<Uint32>(outputOffset, 8);
      const outputArray = Uint32Array.from(output.map(word => word.toNumber()));

      const expectedOutput = sha256Compression(stateArray, inputsArray);
      expect(outputArray).toEqual(expectedOutput);
    });

    it('Should hash correctly - indirect', async () => {
      const state = randomMemoryUint32s(8);
      const stateArray = Uint32Array.from(state.map(byte => byte.toNumber()));
      const inputs = randomMemoryUint32s(16);
      const inputsArray = Uint32Array.from(inputs.map(byte => byte.toNumber()));
      const indirect = new Addressing([
        /*dstOffset=*/ AddressingMode.INDIRECT,
        /*stateOffset*/ AddressingMode.INDIRECT,
        /*inputsOffset*/ AddressingMode.INDIRECT,
      ]).toWire();
      const stateOffset = 0;
      const stateOffsetReal = 10;
      const stateSizeOffset = 1;
      const stateSizeOffsetReal = 100;
      const inputsOffset = 2;
      const inputsOffsetReal = 200;
      const inputsSizeOffset = 3;
      const inputsSizeOffsetReal = 300;
      const outputOffset = 4;
      const outputOffsetReal = 400;
      context.machineState.memory.set(stateSizeOffset, new Uint32(stateSizeOffsetReal));
      context.machineState.memory.set(stateSizeOffsetReal, new Uint32(state.length));
      context.machineState.memory.set(stateOffset, new Uint32(stateOffsetReal));
      context.machineState.memory.setSlice(stateOffsetReal, state);
      context.machineState.memory.set(inputsSizeOffset, new Uint32(inputsSizeOffsetReal));
      context.machineState.memory.set(inputsSizeOffsetReal, new Uint32(inputs.length));
      context.machineState.memory.set(inputsOffset, new Uint32(inputsOffsetReal));
      context.machineState.memory.setSlice(inputsOffsetReal, inputs);
      context.machineState.memory.set(outputOffset, new Uint32(outputOffsetReal));

      await new Sha256Compression(indirect, outputOffset, stateOffset, inputsOffset).execute(context);

      const output = context.machineState.memory.getSliceAs<Uint32>(outputOffsetReal, 8);
      const outputArray = Uint32Array.from(output.map(word => word.toNumber()));

      const expectedOutput = sha256Compression(stateArray, inputsArray);
      expect(outputArray).toEqual(expectedOutput);
    });

    it('Should throw an error when input offsets are out of range.', async () => {
      const indirect = 0;
      const stateOffset = 0;
      const inputsOffset = TaggedMemory.MAX_MEMORY_SIZE - 15;
      const outputOffset = 300;

      await expect(
        new Sha256Compression(indirect, outputOffset, stateOffset, inputsOffset).execute(context),
      ).rejects.toThrow(MemorySliceOutOfRangeError);
    });

    it('Should throw an error when state offsets are out of range.', async () => {
      const inputs = randomMemoryUint32s(16);
      const indirect = 0;
      const stateOffset = TaggedMemory.MAX_MEMORY_SIZE - 7;
      const inputsOffset = 200;
      const outputOffset = 300;
      context.machineState.memory.setSlice(inputsOffset, inputs);

      await expect(
        new Sha256Compression(indirect, outputOffset, stateOffset, inputsOffset).execute(context),
      ).rejects.toThrow(MemorySliceOutOfRangeError);
    });

    it('Should throw an error when output offsets are out of range.', async () => {
      const state = randomMemoryUint32s(8);
      const inputs = randomMemoryUint32s(16);
      const indirect = 0;
      const stateOffset = 0;
      const inputsOffset = 200;
      const outputOffset = TaggedMemory.MAX_MEMORY_SIZE - 7;
      context.machineState.memory.setSlice(stateOffset, state);
      context.machineState.memory.setSlice(inputsOffset, inputs);

      await expect(
        new Sha256Compression(indirect, outputOffset, stateOffset, inputsOffset).execute(context),
      ).rejects.toThrow(MemorySliceOutOfRangeError);
    });
  });
});
