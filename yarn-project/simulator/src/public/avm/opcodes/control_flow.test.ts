import type { AvmContext } from '../avm_context.js';
import { Field, Uint1, Uint8, Uint16, Uint32, Uint64, Uint128 } from '../avm_memory_types.js';
import { InstructionExecutionError, TagCheckError } from '../errors.js';
import { initContext } from '../fixtures/initializers.js';
import { Addressing, AddressingMode } from './addressing_mode.js';
import { InternalCall, InternalReturn, Jump, JumpI } from './control_flow.js';

describe('Control Flow Opcodes', () => {
  let context: AvmContext;

  beforeEach(() => {
    context = initContext();
  });

  describe('JUMP', () => {
    it('Should (de)serialize correctly', () => {
      const buf = Buffer.from([
        Jump.opcode, // opcode
        ...Buffer.from('12340000', 'hex'), // loc
      ]);
      const inst = new Jump(/*loc=*/ 0x12340000);

      expect(Jump.fromBuffer(buf)).toEqual(inst);
      expect(inst.toBuffer()).toEqual(buf);
    });

    it('Should implement JUMP', async () => {
      const jumpLocation = 22;

      expect(context.machineState.pc).toBe(0);

      const instruction = new Jump(jumpLocation);
      await instruction.execute(context);
      expect(context.machineState.pc).toBe(jumpLocation);
    });
  });

  describe('JUMPI', () => {
    it('Should (de)serialize correctly', () => {
      const buf = Buffer.from([
        JumpI.opcode, // opcode
        0x01, // indirect
        ...Buffer.from('a234', 'hex'), // condOffset
        ...Buffer.from('12340000', 'hex'), // loc
      ]);
      const inst = new JumpI(/*indirect=*/ 1, /*condOffset=*/ 0xa234, /*loc=*/ 0x12340000);

      expect(JumpI.fromBuffer(buf)).toEqual(inst);
      expect(inst.toBuffer()).toEqual(buf);
    });

    it('Should implement JUMPI - truthy', async () => {
      const jumpLocation = 22;

      expect(context.machineState.pc).toBe(0);

      context.machineState.memory.set(0, new Uint1(1n));

      const instruction = new JumpI(/*indirect=*/ 0, /*condOffset=*/ 0, jumpLocation);
      await instruction.execute(context);
      expect(context.machineState.pc).toBe(jumpLocation);
    });

    it('Should implement JUMPI - falsy', async () => {
      const jumpLocation = 22;

      context.machineState.nextPc = 30;
      expect(context.machineState.pc).toBe(0);

      context.machineState.memory.set(0, new Uint1(0n));

      const instruction = new JumpI(/*indirect=*/ 0, /*condOffset=*/ 0, jumpLocation);
      await instruction.execute(context);
      expect(context.machineState.pc).toBe(30);
    });

    it('Should implement JUMPI - truthy with indirect', async () => {
      const jumpLocation = 22;
      const condOffset = 10;
      const resolvedCondOffset = 100;

      const addressingMode = Addressing.fromModes([AddressingMode.INDIRECT]);
      const indirect = addressingMode.toWire();

      expect(context.machineState.pc).toBe(0);
      // Set the resolved cond offset.
      context.machineState.memory.set(condOffset, new Uint32(resolvedCondOffset));
      // Set the resolved cond to 1.
      context.machineState.memory.set(resolvedCondOffset, new Uint1(1n));

      const instruction = new JumpI(/*indirect=*/ indirect, /*condOffset=*/ condOffset, jumpLocation);
      await instruction.execute(context);
      expect(context.machineState.pc).toBe(jumpLocation);
    });

    it.each([
      { type: Uint8, name: 'Uint8' },
      { type: Uint16, name: 'Uint16' },
      { type: Uint32, name: 'Uint32' },
      { type: Uint64, name: 'Uint64' },
      { type: Uint128, name: 'Uint128' },
      { type: Field, name: 'Field' },
    ])('Should error if the condition has tag $name', async ({ type }) => {
      context.machineState.memory.set(0, new type(1n));
      const instruction = new JumpI(/*indirect=*/ 0, /*condOffset=*/ 0, 1);
      await expect(instruction.execute(context)).rejects.toThrow(TagCheckError);
    });
  });

  describe('INTERNALCALL and INTERNALRETURN', () => {
    it('INTERNALCALL Should (de)serialize correctly', () => {
      const buf = Buffer.from([
        InternalCall.opcode, // opcode
        ...Buffer.from('12340000', 'hex'), // loc
      ]);
      const inst = new InternalCall(/*loc=*/ 0x12340000);

      expect(InternalCall.fromBuffer(buf)).toEqual(inst);
      expect(inst.toBuffer()).toEqual(buf);
    });

    it('Should implement Internal Call and Return', async () => {
      const jumpLocation = 22;

      expect(context.machineState.pc).toBe(0);
      context.machineState.nextPc = 6;

      const instruction = new InternalCall(jumpLocation);
      const returnInstruction = new InternalReturn();

      await instruction.execute(context);
      expect(context.machineState.pc).toBe(jumpLocation);

      await returnInstruction.execute(context);
      expect(context.machineState.pc).toBe(6);
    });

    it('Should error if Internal Return is called without a corresponding Internal Call', async () => {
      const returnInstruction = () => new InternalReturn().execute(context);
      await expect(returnInstruction()).rejects.toThrow(InstructionExecutionError);
    });
  });
});
