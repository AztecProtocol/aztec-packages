import { type SimulationError } from '@aztec/circuit-types';
import { Gas } from '@aztec/circuits.js';
import { type Fr } from '@aztec/foundation/fields';

import { inspect } from 'util';

import { createSimulationError } from '../common/errors.js';
import { type Gas as AvmGas } from './avm_gas.js';
import { type AvmRevertReason } from './errors.js';

/**
 * Results of an contract call's execution in the AVM.
 */
export class AvmContractCallResult {
  constructor(
    public reverted: boolean,
    public output: Fr[],
    public gasLeft: AvmGas,
    public revertReason?: AvmRevertReason,
  ) {}

  toString(): string {
    let resultsStr = `reverted: ${this.reverted}, output: ${this.output}, gasLeft: ${inspect(this.gasLeft)}`;
    if (this.revertReason) {
      resultsStr += `, revertReason: ${this.revertReason}`;
    }
    return resultsStr;
  }

  finalize(): AvmFinalizedCallResult {
    const revertReason = this.revertReason ? createSimulationError(this.revertReason, this.output) : undefined;
    return new AvmFinalizedCallResult(this.reverted, this.output, Gas.from(this.gasLeft), revertReason);
  }
}

/**
 * Similar to AvmContractCallResult, but with a SimulationError and standard Gas
 * which are useful for consumption external to core AVM simulation.
 */
export class AvmFinalizedCallResult {
  constructor(
    public reverted: boolean,
    public output: Fr[],
    public gasLeft: Gas,
    public revertReason?: SimulationError,
  ) {}

  toString(): string {
    let resultsStr = `reverted: ${this.reverted}, output: ${this.output}, gasLeft: ${inspect(this.gasLeft)}`;
    if (this.revertReason) {
      resultsStr += `, revertReason: ${this.revertReason}`;
    }
    return resultsStr;
  }
}
