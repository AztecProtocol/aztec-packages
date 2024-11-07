import { SimulationError } from '@aztec/circuit-types';
import { ARGS_LENGTH, Fr, Gas } from '@aztec/circuits.js';
import { makeAztecAddress, makeSelector } from '@aztec/circuits.js/testing';
import { FunctionType } from '@aztec/foundation/abi';
import { padArrayEnd } from '@aztec/foundation/collection';

import { type EnqueuedPublicCallExecutionResult } from '../public/execution.js';

export class PublicExecutionResultBuilder {
  private _returnValues: Fr[] = [];
  private _reverted = false;
  private _revertReason: SimulationError | undefined = undefined;

  constructor() {}

  static empty(basicRevert = false) {
    const builder = new PublicExecutionResultBuilder();
    if (basicRevert) {
      builder.withReverted(new SimulationError('Simulation failed', []));
    }
    return builder;
  }

  static fromPublicExecutionRequest({
    returnValues = [new Fr(1n)],
    revertReason = undefined,
  }: {
    returnValues?: Fr[];
    revertReason?: SimulationError;
  }): PublicExecutionResultBuilder {
    const builder = new PublicExecutionResultBuilder();

    builder.withReturnValues(...returnValues);
    if (revertReason) {
      builder.withReverted(revertReason);
    }

    return builder;
  }

  withReturnValues(...values: Fr[]): PublicExecutionResultBuilder {
    this._returnValues.push(...values);
    return this;
  }

  withReverted(reason: SimulationError): PublicExecutionResultBuilder {
    this._reverted = true;
    this._revertReason = reason;
    return this;
  }

  build(overrides: Partial<EnqueuedPublicCallExecutionResult> = {}): EnqueuedPublicCallExecutionResult {
    return {
      endGasLeft: Gas.test(),
      endSideEffectCounter: Fr.ZERO,
      returnValues: padArrayEnd(this._returnValues, Fr.ZERO, 4), // TODO(#5450) Need to use the proper return values here
      reverted: this._reverted,
      revertReason: this._revertReason,
      ...overrides,
    };
  }
}

export const makeFunctionCall = (
  name = 'function',
  to = makeAztecAddress(30),
  selector = makeSelector(5),
  type = FunctionType.PUBLIC,
  args = new Array(ARGS_LENGTH).fill(Fr.ZERO),
  isStatic = false,
  returnTypes = [],
) => ({ name, to, selector, type, args, isStatic, returnTypes });
