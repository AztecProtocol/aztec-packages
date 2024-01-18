import { mock } from 'jest-mock-extended';

import { AvmMachineState } from '../avm_machine_state.js';
import { AvmStateManager } from '../avm_state_manager.js';
import { Add, Mul, Sub } from './arithmetic.js';
import { And, Not, Or, Shl, Shr, Xor } from './bitwise.js';
import { Eq, Lt, Lte } from './comparators.js';
import { InternalCall, InternalReturn, Jump } from './control_flow.js';
import { CalldataCopy, Cast, Mov, Set } from './memory.js';

describe('Control Flow Opcodes', () => {
  let stateManager = mock<AvmStateManager>();
  let machineState: AvmMachineState;

  beforeEach(() => {
    stateManager = mock<AvmStateManager>();
    machineState = new AvmMachineState([]);
  });

  it('Should implement JUMP', () => {
    const jumpLocation = 22;

    expect(machineState.pc).toBe(0);

    const instruction = new Jump(jumpLocation);
    instruction.execute(machineState, stateManager);
    expect(machineState.pc).toBe(jumpLocation);
  });

  it('Should implement Internal Call and Return', () => {
    const jumpLocation = 22;

    expect(machineState.pc).toBe(0);

    const instruction = new InternalCall(jumpLocation);
    const returnInstruction = new InternalReturn();

    instruction.execute(machineState, stateManager);
    expect(machineState.pc).toBe(jumpLocation);

    returnInstruction.execute(machineState, stateManager);
    expect(machineState.pc).toBe(1);
  });

  it('Should increment PC on All other Instructions', () => {
    const instructions = [
      new Add(0, 1, 2),
      new Sub(0, 1, 2),
      new Mul(0, 1, 2),
      new Lt(0, 1, 2),
      new Lte(0, 1, 2),
      new Eq(0, 1, 2),
      new Xor(0, 1, 2),
      new And(0, 1, 2),
      new Or(0, 1, 2),
      new Shl(0, 1, 2),
      new Shr(0, 1, 2),
      new Not(0, 2),
      new CalldataCopy(0, 1, 2),
      new Set(0n, 1),
      new Mov(0, 1),
      new Cast(0, 1),
    ];

    for (const instruction of instructions) {
      // Use a fresh machine state each run
      const innerMachineState = new AvmMachineState([]);
      expect(machineState.pc).toBe(0);
      instruction.execute(innerMachineState, stateManager);
      expect(innerMachineState.pc).toBe(1);
    }
  });
});
