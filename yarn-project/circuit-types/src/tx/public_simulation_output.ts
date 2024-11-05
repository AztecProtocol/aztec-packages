import { CombinedConstantData, Fr, Gas } from '@aztec/circuits.js';
import { mapValues } from '@aztec/foundation/collection';
import { schemas } from '@aztec/foundation/schemas';

import { z } from 'zod';

import { SimulationError } from '../simulation_error.js';
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

  static get schema(): z.ZodType<NestedProcessReturnValues, any, any> {
    return z
      .object({
        values: z.array(schemas.Fr).optional(),
        nested: z.array(z.lazy(() => NestedProcessReturnValues.schema)),
      })
      .transform(({ values, nested }) => new NestedProcessReturnValues(values, nested));
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

  static get schema() {
    return z
      .object({
        revertReason: SimulationError.schema.optional(),
        constants: CombinedConstantData.schema,
        txEffect: TxEffect.schema,
        publicReturnValues: z.array(NestedProcessReturnValues.schema),
        gasUsed: z.object({ totalGas: Gas.schema, teardownGas: Gas.schema }),
      })
      .transform(
        fields =>
          new PublicSimulationOutput(
            fields.revertReason,
            fields.constants,
            fields.txEffect,
            fields.publicReturnValues,
            fields.gasUsed,
          ),
      );
  }

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
