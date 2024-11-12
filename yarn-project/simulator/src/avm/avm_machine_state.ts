import { type Fr } from '@aztec/circuits.js';

import { GAS_DIMENSIONS, type Gas } from './avm_gas.js';
import { TaggedMemory } from './avm_memory_types.js';
import { type AvmRevertReason, OutOfGasError } from './errors.js';

/**
 * A few fields of machine state are initialized from AVM session inputs or call instruction arguments
 */
export type InitialAvmMachineState = {
  l2GasLeft: number;
  daGasLeft: number;
};

/**
 * Used to track the call stack and revert data of nested calls.
 * This is used to provide a more detailed revert reason when a contract call reverts.
 * It is only a heuristic and may not always provide the correct revert reason.
 */
type TrackedRevertInfo = {
  revertDataRepresentative: Fr[];
  recursiveRevertReason: AvmRevertReason;
};

type CallStackEntry = {
  callPc: number;
  returnPc: number;
};

/**
 * Avm state modified on an instruction-per-instruction basis.
 */
export class AvmMachineState {
  /** gas remaining of the gas allocated for a contract call */
  public l2GasLeft: number;
  public daGasLeft: number;
  /** program counter, byte based */
  public pc: number = 0;
  /** program counter of the next instruction, byte based */
  public nextPc: number = 0;
  /** return/revertdata of the last nested call. */
  public nestedReturndata: Fr[] = [];
  /**
   * Used to track the call stack and revert data of nested calls.
   * This is used to provide a more detailed revert reason when a contract call reverts.
   * It is only a heuristic and may not always provide the correct revert reason.
   */
  public collectedRevertInfo: TrackedRevertInfo | undefined;

  /**
   * On INTERNALCALL, internal call stack is pushed to with the current pc and the return pc.
   * On INTERNALRETURN, value is popped from the internal call stack and assigned to the return pc.
   */
  public internalCallStack: CallStackEntry[] = [];

  /** Memory accessible to user code */
  public readonly memory: TaggedMemory = new TaggedMemory();

  /**
   * Signals that execution should end.
   * AvmContext execution continues executing instructions until the machine state signals "halted"
   */
  private halted: boolean = false;
  /** Signals that execution has reverted normally (this does not cover exceptional halts) */
  private reverted: boolean = false;
  /** Output data must NOT be modified once it is set */
  private output: Fr[] = [];

  constructor(gasLeft: Gas);
  constructor(l2GasLeft: number, daGasLeft: number);
  constructor(gasLeftOrL2GasLeft: Gas | number, daGasLeft?: number) {
    if (typeof gasLeftOrL2GasLeft === 'object') {
      ({ l2Gas: this.l2GasLeft, daGas: this.daGasLeft } = gasLeftOrL2GasLeft);
    } else {
      this.l2GasLeft = gasLeftOrL2GasLeft!;
      this.daGasLeft = daGasLeft!;
    }
  }

  public get gasLeft(): Gas {
    return { l2Gas: this.l2GasLeft, daGas: this.daGasLeft };
  }

  public static fromState(state: InitialAvmMachineState): AvmMachineState {
    return new AvmMachineState(state.l2GasLeft, state.daGasLeft);
  }

  /**
   * Consumes the given gas.
   * Should any of the gas dimensions get depleted, it sets all gas left to zero and triggers
   * an exceptional halt by throwing an OutOfGasError.
   */
  public consumeGas(gasCost: Partial<Gas>) {
    // Assert there is enough gas on every dimension.
    const outOfGasDimensions = GAS_DIMENSIONS.filter(
      dimension => this[`${dimension}Left`] - (gasCost[dimension] ?? 0) < 0,
    );
    // If not, trigger an exceptional halt.
    // See https://yp-aztec.netlify.app/docs/public-vm/execution#gas-checks-and-tracking
    if (outOfGasDimensions.length > 0) {
      this.exceptionalHalt();
      throw new OutOfGasError(outOfGasDimensions);
    }
    // Otherwise, charge the corresponding gas
    for (const dimension of GAS_DIMENSIONS) {
      this[`${dimension}Left`] -= gasCost[dimension] ?? 0;
    }
  }

  /** Increases the gas left by the amounts specified. */
  public refundGas(gasRefund: Partial<Gas>) {
    for (const dimension of GAS_DIMENSIONS) {
      this[`${dimension}Left`] += gasRefund[dimension] ?? 0;
    }
  }

  /**
   * Halt as successful
   * Output data must NOT be modified once it is set
   * @param output
   */
  public return(output: Fr[]) {
    this.halted = true;
    this.output = output;
  }

  /**
   * Halt as reverted
   * Output data must NOT be modified once it is set
   * @param output
   */
  public revert(output: Fr[]) {
    this.halted = true;
    this.reverted = true;
    this.output = output;
  }

  public getHalted(): boolean {
    return this.halted;
  }

  public getReverted(): boolean {
    return this.reverted;
  }

  public getOutput(): Fr[] {
    return this.output;
  }

  /**
   * Flag an exceptional halt. Clears gas left and sets the reverted flag. No output data.
   */
  private exceptionalHalt() {
    GAS_DIMENSIONS.forEach(dimension => (this[`${dimension}Left`] = 0));
    this.reverted = true;
    this.halted = true;
  }
}
