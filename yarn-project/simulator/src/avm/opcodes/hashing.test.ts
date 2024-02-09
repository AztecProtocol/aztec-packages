import { toBigIntBE } from '@aztec/foundation/bigint-buffer';
import { keccak, poseidonHash } from '@aztec/foundation/crypto';

import { AvmContext } from '../avm_context.js';
import { Field } from '../avm_memory_types.js';
import { initContext } from '../fixtures/index.js';
import { Keccak, Poseidon2 } from './hashing.js';

describe('Hashing Opcodes', () => {
  let context: AvmContext;

  beforeEach(async () => {
    context = initContext();
  });

  describe('Poseidon2', () => {
    it('Should (de)serialize correctly', () => {
      const buf = Buffer.from([
        Poseidon2.opcode, // opcode
        ...Buffer.from('12345678', 'hex'), // destOffset
        ...Buffer.from('23456789', 'hex'), // hashOffset
        ...Buffer.from('3456789a', 'hex'), // hashSize
      ]);
      const inst = new Poseidon2(/*destOffset=*/ 0x12345678, /*hashOffset=*/ 0x23456789, /*hashSize=*/ 0x3456789a);

      expect(Poseidon2.deserialize(buf)).toEqual(inst);
      expect(inst.serialize()).toEqual(buf);
    });

    it('Should hash correctly', async () => {
      const args = [new Field(1n), new Field(2n), new Field(3n)];
      const hashOffset = 0;
      context.machineState.memory.setSlice(hashOffset, args);

      const destOffset = 3;

      const expectedHash = poseidonHash(args.map(field => field.toBuffer()));
      await new Poseidon2(destOffset, hashOffset, args.length).execute(context);

      const result = context.machineState.memory.get(destOffset);
      expect(result).toEqual(new Field(toBigIntBE(expectedHash)));
    });
  });

  describe('Keccak', () => {
    it('Should (de)serialize correctly', () => {
      const buf = Buffer.from([
        Keccak.opcode, // opcode
        ...Buffer.from('12345678', 'hex'), // destOffset
        ...Buffer.from('23456789', 'hex'), // hashOffset
        ...Buffer.from('3456789a', 'hex'), // hashSize
      ]);
      const inst = new Keccak(/*destOffset=*/ 0x12345678, /*hashOffset=*/ 0x23456789, /*hashSize=*/ 0x3456789a);

      expect(Keccak.deserialize(buf)).toEqual(inst);
      expect(inst.serialize()).toEqual(buf);
    });

    it('Should hash correctly', async () => {
      const args = [new Field(1n), new Field(2n), new Field(3n)];
      const hashOffset = 0;
      context.machineState.memory.setSlice(hashOffset, args);

      const destOffset = 3;

      const inputBuffer = Buffer.concat(args.map(field => field.toBuffer()));
      const expectedHash = keccak(inputBuffer);
      await new Keccak(destOffset, hashOffset, args.length).execute(context);

      const result = context.machineState.memory.getSliceAs<Field>(destOffset, 2);
      const combined = Buffer.concat([result[0].toBuffer().subarray(16, 32), result[1].toBuffer().subarray(16, 32)]);

      expect(combined).toEqual(expectedHash);
    });
  });
});
