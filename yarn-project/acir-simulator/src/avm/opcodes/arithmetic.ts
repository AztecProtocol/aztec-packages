import { Fr } from '@aztec/foundation/fields';

import { AvmMachineState } from '../avm_machine_state.js';
import { AvmStateManager } from '../avm_state_manager.js';
import { Instruction } from './instruction.js';

/** -*/
export class Add implements Instruction {
  static type: string = 'ADD';
  static numberOfOperands = 3;

  constructor(private aOffset: number, private bOffset: number, private destOffset: number) {}

  execute(machineState: AvmMachineState, _stateManager: AvmStateManager): void {
    const a = machineState.readMemory(this.aOffset);
    const b = machineState.readMemory(this.bOffset);

    const dest = new Fr(a.toBigInt() + (b.toBigInt() % Fr.MODULUS));
    machineState.writeMemory(this.destOffset, dest);
  }
}

/** -*/
export class Sub implements Instruction {
  static type: string = 'SUB';
  static numberOfOperands = 3;

  constructor(private aOffset: number, private bOffset: number, private destOffset: number) {}

  execute(machineState: AvmMachineState, _stateManager: AvmStateManager): void {
    const a = machineState.readMemory(this.aOffset);
    const b = machineState.readMemory(this.bOffset);

    const dest = new Fr(a.toBigInt() - (b.toBigInt() % Fr.MODULUS));
    machineState.writeMemory(this.destOffset, dest);
  }
}

/** -*/
export class Mul implements Instruction {
  static type: string = 'MUL';
  static numberOfOperands = 3;

  constructor(private aOffset: number, private bOffset: number, private destOffset: number) {}

  execute(machineState: AvmMachineState, _stateManager: AvmStateManager): void {
    const a: Fr = machineState.readMemory(this.aOffset);
    const b: Fr = machineState.readMemory(this.bOffset);

    const dest = new Fr((a.toBigInt() * b.toBigInt()) % Fr.MODULUS);
    machineState.writeMemory(this.destOffset, dest);
  }
}

/** -*/
export class Div implements Instruction {
  static type: string = 'DIV';
  static numberOfOperands = 3;

  constructor(private aOffset: number, private bOffset: number, private destOffset: number) {}

  execute(machineState: AvmMachineState, _stateManager: AvmStateManager): void {
    const a: Fr = machineState.readMemory(this.aOffset);
    const b: Fr = machineState.readMemory(this.bOffset);

    // TODO(https://github.com/AztecProtocol/aztec-packages/issues/3993): proper field division
    const dest = new Fr(a.toBigInt() / b.toBigInt());
    machineState.writeMemory(this.destOffset, dest);
  }
}
