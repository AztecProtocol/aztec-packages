import { Fr } from '@aztec/foundation/fields';
import { BufferReader, FieldReader, serializeToBuffer, serializeToFields } from '@aztec/foundation/serialize';
import { type FieldsOf } from '@aztec/foundation/types';

import { inspect } from 'util';

import { MAX_L2_GAS_PER_ENQUEUED_CALL } from '../constants.gen.js';
import { type GasFees } from './gas_fees.js';
import { type UInt32 } from './shared.js';

export const GasDimensions = ['da', 'l2'] as const;
export type GasDimensions = (typeof GasDimensions)[number];

/** Gas amounts in each dimension. */
export class Gas {
  constructor(public readonly daGas: UInt32, public readonly l2Gas: UInt32) {}

  clone(): Gas {
    return new Gas(this.daGas, this.l2Gas);
  }

  get(dimension: GasDimensions) {
    return this[`${dimension}Gas`];
  }

  equals(other: Gas) {
    return this.daGas === other.daGas && this.l2Gas === other.l2Gas;
  }

  static from(fields: Partial<FieldsOf<Gas>>) {
    return new Gas(fields.daGas ?? 0, fields.l2Gas ?? 0);
  }

  static empty() {
    return new Gas(0, 0);
  }

  /** Returns large enough gas amounts for testing purposes. */
  static test() {
    return new Gas(1e9, MAX_L2_GAS_PER_ENQUEUED_CALL);
  }

  isEmpty() {
    return this.daGas === 0 && this.l2Gas === 0;
  }

  static fromBuffer(buffer: Buffer | BufferReader): Gas {
    const reader = BufferReader.asReader(buffer);
    return new Gas(reader.readNumber(), reader.readNumber());
  }

  toBuffer() {
    return serializeToBuffer(this.daGas, this.l2Gas);
  }

  [inspect.custom]() {
    return `Gas { daGas=${this.daGas} l2Gas=${this.l2Gas} }`;
  }

  add(other: Gas) {
    return new Gas(this.daGas + other.daGas, this.l2Gas + other.l2Gas);
  }

  sub(other: Gas) {
    return new Gas(this.daGas - other.daGas, this.l2Gas - other.l2Gas);
  }

  mul(scalar: number) {
    return new Gas(Math.ceil(this.daGas * scalar), Math.ceil(this.l2Gas * scalar));
  }

  computeFee(gasFees: GasFees) {
    return GasDimensions.reduce(
      (acc, dimension) => acc.add(gasFees.get(dimension).mul(new Fr(this.get(dimension)))),
      Fr.ZERO,
    );
  }

  toFields() {
    return serializeToFields(this.daGas, this.l2Gas);
  }

  static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    return new Gas(reader.readU32(), reader.readU32());
  }

  toJSON() {
    return { daGas: this.daGas, l2Gas: this.l2Gas };
  }

  static fromJSON(json: any) {
    return new Gas(json.daGas, json.l2Gas);
  }
}
