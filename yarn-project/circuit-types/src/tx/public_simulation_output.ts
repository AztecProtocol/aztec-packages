import { CombinedConstantData, Fr, Gas } from '@aztec/circuits.js';
import { mapValues } from '@aztec/foundation/collection';

import { type SimulationError } from '../simulation_error.js';
import { TxEffect } from '../tx_effect.js';
import { type GasUsed } from './gas_used.js';

/** Return values of simulating a circuit. */
export type ProcessReturnValues = Fr[] | undefined;

/** Return values of simulating complete callstack. */
export class NestedProcessReturnValues {
  values: ProcessReturnValues;
  nested: NestedProcessReturnValues[];

  constructor(values: ProcessReturnValues, nested?: NestedProcessReturnValues[]) {
    this.values = values;
    this.nested = nested ?? [];
  }

  toJSON(): any {
    return {
      values: this.values?.map(fr => fr.toString()),
      nested: this.nested.map(n => n.toJSON()),
    };
  }

  static fromJSON(json: any): NestedProcessReturnValues {
    return new NestedProcessReturnValues(
      json.values?.map(Fr.fromString),
      json.nested?.map((n: any) => NestedProcessReturnValues.fromJSON(n)),
    );
  }

  static empty() {
    return new NestedProcessReturnValues([]);
  }
}

/**
 * Outputs of processing the public component of a transaction.
 */
export class PublicSimulationOutput {
  constructor(
    public revertReason: SimulationError | undefined,
    public constants: CombinedConstantData,
    public txEffect: TxEffect,
    public publicReturnValues: NestedProcessReturnValues[],
    public gasUsed: GasUsed,
  ) {}

  toJSON() {
    return {
      revertReason: this.revertReason,
      constants: this.constants.toBuffer().toString('hex'),
      txEffect: this.txEffect.toBuffer().toString('hex'),
      publicReturnValues: this.publicReturnValues.map(returns => returns?.toJSON()),
      gasUsed: mapValues(this.gasUsed, gas => gas?.toJSON()),
    };
  }

  static fromJSON(json: any): PublicSimulationOutput {
    return new PublicSimulationOutput(
      json.revertReason,
      CombinedConstantData.fromBuffer(Buffer.from(json.constants, 'hex')),
      TxEffect.fromBuffer(Buffer.from(json.txEffect, 'hex')),
      Array.isArray(json.publicReturnValues)
        ? json.publicReturnValues.map((returns: any) => NestedProcessReturnValues.fromJSON(returns))
        : [],
      mapValues(json.gasUsed, gas => Gas.fromJSON(gas)),
    );
  }
}
