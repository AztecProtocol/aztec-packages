import { Fr } from '@aztec/foundation/fields';

import { MockProxy, mock } from 'jest-mock-extended';

import { AvmMachineState } from '../avm_machine_state.js';
import { Field, Uint16 } from '../avm_memory_types.js';
import { initExecutionEnvironment } from '../fixtures/index.js';
import { AvmJournal } from '../journal/journal.js';
import { InternalCall, InternalReturn, Jump, JumpI, Return, Revert } from './control_flow.js';
import { InstructionExecutionError } from './instruction.js';

describe('Control Flow Opcodes', () => {
  let journal: MockProxy<AvmJournal>;
  let machineState: AvmMachineState;

  beforeEach(() => {
    journal = mock<AvmJournal>();
    machineState = new AvmMachineState(initExecutionEnvironment());
  });

  describe('JUMP', () => {
    it('Should deserialize correctly', () => {
      const buf = Buffer.from([
        Jump.opcode, // opcode
        ...Buffer.from('12345678', 'hex'), // loc
      ]);

      const inst: Jump = Jump.deserialize(buf);
      expect(inst).toEqual(new Jump(/*loc=*/ 0x12345678));
    });

    it('Should serialize correctly', () => {
      const inst = new Jump(/*loc=*/ 0x12345678);

      const expected = Buffer.from([
        Jump.opcode, // opcode
        ...Buffer.from('12345678', 'hex'), // loc
      ]);
      expect(inst.serialize()).toEqual(expected);
    });

    it('Should implement JUMP', async () => {
      const jumpLocation = 22;

      expect(machineState.pc).toBe(0);

      const instruction = new Jump(jumpLocation);
      await instruction.execute(machineState, journal);
      expect(machineState.pc).toBe(jumpLocation);
    });
  });

  describe('JUMPI', () => {
    it('Should deserialize correctly', () => {
      const buf = Buffer.from([
        JumpI.opcode, // opcode
        0x01, // indirect
        ...Buffer.from('12345678', 'hex'), // loc
        ...Buffer.from('a2345678', 'hex'), // condOffset
      ]);

      const inst: JumpI = JumpI.deserialize(buf);
      expect(inst).toEqual(new JumpI(/*indirect=*/ 1, /*loc=*/ 0x12345678, /*condOffset=*/ 0xa2345678));
    });

    it('Should serialize correctly', () => {
      const inst = new JumpI(/*indirect=*/ 1, /*loc=*/ 0x12345678, /*condOffset=*/ 0xa2345678);

      const expected = Buffer.from([
        JumpI.opcode, // opcode
        0x01, // indirect
        ...Buffer.from('12345678', 'hex'), // loc
        ...Buffer.from('a2345678', 'hex'), // condOffset
      ]);
      expect(inst.serialize()).toEqual(expected);
    });

    it('Should implement JUMPI - truthy', async () => {
      const jumpLocation = 22;
      const jumpLocation1 = 69;

      expect(machineState.pc).toBe(0);

      machineState.memory.set(0, new Uint16(1n));
      machineState.memory.set(1, new Uint16(2n));

      const instruction = new JumpI(/*indirect=*/ 0, jumpLocation, /*condOffset=*/ 0);
      await instruction.execute(machineState, journal);
      expect(machineState.pc).toBe(jumpLocation);

      // Truthy can be greater than 1
      const instruction1 = new JumpI(/*indirect=*/ 0, jumpLocation1, /*condOffset=*/ 1);
      await instruction1.execute(machineState, journal);
      expect(machineState.pc).toBe(jumpLocation1);
    });

    it('Should implement JUMPI - falsy', async () => {
      const jumpLocation = 22;

      expect(machineState.pc).toBe(0);

      machineState.memory.set(0, new Uint16(0n));

      const instruction = new JumpI(/*indirect=*/ 0, jumpLocation, /*condOffset=*/ 0);
      await instruction.execute(machineState, journal);
      expect(machineState.pc).toBe(1);
    });
  });

  describe('INTERNALCALL and RETURN', () => {
    it('INTERNALCALL should deserialize correctly', () => {
      const buf = Buffer.from([
        InternalCall.opcode, // opcode
        ...Buffer.from('12345678', 'hex'), // loc
      ]);

      const inst = InternalCall.deserialize(buf);
      expect(inst).toEqual(new InternalCall(/*loc=*/ 0x12345678));
    });

    it('INTERNALCALL should serialize correctly', () => {
      const inst = new InternalCall(/*loc=*/ 0x12345678);

      const expected = Buffer.from([
        InternalCall.opcode, // opcode
        ...Buffer.from('12345678', 'hex'), // loc
      ]);

      expect(inst.serialize()).toEqual(expected);
    });

    it('Should implement Internal Call and Return', async () => {
      const jumpLocation = 22;

      expect(machineState.pc).toBe(0);

      const instruction = new InternalCall(jumpLocation);
      const returnInstruction = new InternalReturn();

      await instruction.execute(machineState, journal);
      expect(machineState.pc).toBe(jumpLocation);

      await returnInstruction.execute(machineState, journal);
      expect(machineState.pc).toBe(1);
    });

    it('Should error if Internal Return is called without a corresponding Internal Call', async () => {
      const returnInstruction = () => new InternalReturn().execute(machineState, journal);
      await expect(returnInstruction()).rejects.toThrow(InstructionExecutionError);
    });
  });

  describe('General flow', () => {
    it('Should chain series of control flow instructions', async () => {
      const jumpLocation0 = 22;
      const jumpLocation1 = 69;
      const jumpLocation2 = 1337;

      const aloneJumpLocation = 420;

      const instructions = [
        // pc  |  internal call stack
        new InternalCall(jumpLocation0), // 22  | [1]
        new InternalCall(jumpLocation1), // 69  | [1, 23]
        new InternalReturn(), // 23  | [1]
        new Jump(aloneJumpLocation), // 420 | [1]
        new InternalCall(jumpLocation2), // 1337| [1, 421]
        new InternalReturn(), // 421 | [1]
        new InternalReturn(), // 1   | []
      ];

      // The expected program counter after each instruction is invoked
      const expectedPcs = [
        jumpLocation0,
        jumpLocation1,
        jumpLocation0 + 1,
        aloneJumpLocation,
        jumpLocation2,
        aloneJumpLocation + 1,
        1,
      ];

      for (let i = 0; i < instructions.length; i++) {
        await instructions[i].execute(machineState, journal);
        expect(machineState.pc).toBe(expectedPcs[i]);
      }
    });
  });

  describe('RETURN', () => {
    it('Should deserialize correctly', () => {
      const buf = Buffer.from([
        Return.opcode, // opcode
        0x01, // indirect
        ...Buffer.from('12345678', 'hex'), // returnOffset
        ...Buffer.from('a2345678', 'hex'), // copySize
      ]);

      const inst = Return.deserialize(buf);
      expect(inst).toEqual(new Return(/*indirect=*/ 0x01, /*returnOffset=*/ 0x12345678, /*copySize=*/ 0xa2345678));
    });

    it('Should serialize correctly', () => {
      const inst = new Return(/*indirect=*/ 0x01, /*returnOffset=*/ 0x12345678, /*copySize=*/ 0xa2345678);

      const expected = Buffer.from([
        Return.opcode, // opcode
        0x01, // indirect
        ...Buffer.from('12345678', 'hex'), // returnOffset
        ...Buffer.from('a2345678', 'hex'), // copySize
      ]);

      expect(inst.serialize()).toEqual(expected);
    });

    it('Should return data from the return opcode', async () => {
      const returnData = [new Fr(1n), new Fr(2n), new Fr(3n)];

      machineState.memory.set(0, new Field(1n));
      machineState.memory.set(1, new Field(2n));
      machineState.memory.set(2, new Field(3n));

      const instruction = new Return(/*indirect=*/ 0, /*returnOffset=*/ 0, returnData.length);
      await instruction.execute(machineState, journal);

      expect(machineState.getReturnData()).toEqual(returnData);
      expect(machineState.halted).toBe(true);
      expect(machineState.reverted).toBe(false);
    });
  });

  describe('REVERT', () => {
    it('Should deserialize correctly', () => {
      const buf = Buffer.from([
        Revert.opcode, // opcode
        0x01, // indirect
        ...Buffer.from('12345678', 'hex'), // returnOffset
        ...Buffer.from('a2345678', 'hex'), // retSize
      ]);

      const inst = Revert.deserialize(buf);
      expect(inst).toEqual(new Revert(/*indirect=*/ 0x01, /*returnOffset=*/ 0x12345678, /*retSize=*/ 0xa2345678));
    });

    it('Should serialize correctly', () => {
      const inst = new Revert(/*indirect=*/ 0x01, /*returnOffset=*/ 0x12345678, /*retSize=*/ 0xa2345678);

      const expected = Buffer.from([
        Revert.opcode, // opcode
        0x01, // indirect
        ...Buffer.from('12345678', 'hex'), // returnOffset
        ...Buffer.from('a2345678', 'hex'), // retSize
      ]);

      expect(inst.serialize()).toEqual(expected);
    });

    it('Should return data and revert from the revert opcode', async () => {
      const returnData = [new Fr(1n), new Fr(2n), new Fr(3n)];

      machineState.memory.set(0, new Field(1n));
      machineState.memory.set(1, new Field(2n));
      machineState.memory.set(2, new Field(3n));

      const instruction = new Revert(/*indirect=*/ 0, /*returnOffset=*/ 0, returnData.length);
      await instruction.execute(machineState, journal);

      expect(machineState.getReturnData()).toEqual(returnData);
      expect(machineState.halted).toBe(true);
      expect(machineState.reverted).toBe(true);
    });
  });
});
