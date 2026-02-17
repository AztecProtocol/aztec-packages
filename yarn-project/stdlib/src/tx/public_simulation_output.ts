import { Fr } from '@aztec/foundation/curves/bn254';
import { type ZodFor, schemas } from '@aztec/foundation/schemas';

import times from 'lodash.times';
import { z } from 'zod';

import { SimulationError } from '../errors/simulation_error.js';
import { Gas } from '../gas/gas.js';
import type { GasUsed } from '../gas/gas_used.js';
import { NullishToUndefined } from '../schemas/schemas.js';
import { TxEffect } from '../tx/tx_effect.js';
import { GlobalVariables } from './global_variables.js';

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

  equals(other: NestedProcessReturnValues): boolean {
    return (
      this.values?.length === other.values?.length &&
      this.nested.length === other.nested.length &&
      (this.values === undefined || this.values.every((v, i) => v.equals(other.values![i]))) &&
      this.nested.every((n, i) => n.equals(other.nested[i]))
    );
  }

  static get schema(): ZodFor<NestedProcessReturnValues> {
    return z
      .object({
        values: NullishToUndefined(z.array(schemas.Fr)),
        nested: z.array(z.lazy(() => NestedProcessReturnValues.schema)),
      })
      .transform(({ values, nested }) => new NestedProcessReturnValues(values, nested));
  }

  static fromPlainObject(obj: any): NestedProcessReturnValues {
    return new NestedProcessReturnValues(
      obj.values?.map(Fr.fromPlainObject),
      obj.nested?.map(NestedProcessReturnValues.fromPlainObject),
    );
  }

  static empty() {
    return new NestedProcessReturnValues([]);
  }

  static random(depth = 1): NestedProcessReturnValues {
    return new NestedProcessReturnValues(
      times(3, Fr.random),
      depth > 0 ? [NestedProcessReturnValues.random(depth - 1)] : [],
    );
  }
}

/**
 * Outputs of processing the public component of a transaction.
 */
export class PublicSimulationOutput {
  constructor(
    public revertReason: SimulationError | undefined,
    public globalVariables: GlobalVariables,
    public txEffect: TxEffect,
    public publicReturnValues: NestedProcessReturnValues[],
    public gasUsed: GasUsed,
  ) {}

  static get schema(): ZodFor<PublicSimulationOutput> {
    return z
      .object({
        revertReason: SimulationError.schema.optional(),
        globalVariables: GlobalVariables.schema,
        txEffect: TxEffect.schema,
        publicReturnValues: z.array(NestedProcessReturnValues.schema),
        gasUsed: z.object({
          totalGas: Gas.schema,
          teardownGas: Gas.schema,
          publicGas: Gas.schema,
          billedGas: Gas.schema,
        }),
      })
      .transform(
        fields =>
          new PublicSimulationOutput(
            fields.revertReason,
            fields.globalVariables,
            fields.txEffect,
            fields.publicReturnValues,
            fields.gasUsed,
          ),
      );
  }

  static async random() {
    return new PublicSimulationOutput(
      await SimulationError.random(),
      GlobalVariables.empty(),
      TxEffect.empty(),
      times(2, NestedProcessReturnValues.random),
      { teardownGas: Gas.random(), totalGas: Gas.random(), publicGas: Gas.random(), billedGas: Gas.random() },
    );
  }
}
