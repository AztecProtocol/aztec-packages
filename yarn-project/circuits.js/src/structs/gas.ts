import { Fr } from '@aztec/foundation/fields';
import { schemas } from '@aztec/foundation/schemas';
import { BufferReader, FieldReader, serializeToBuffer, serializeToFields } from '@aztec/foundation/serialize';
import { type FieldsOf } from '@aztec/foundation/types';

import { inspect } from 'util';
import { z } from 'zod';

import { type GasFees } from './gas_fees.js';
import { type UInt32 } from './shared.js';

export const GasDimensions = ['da', 'l2'] as const;
export type GasDimensions = (typeof GasDimensions)[number];

/** Gas amounts in each dimension. */
export class Gas {
  constructor(public readonly daGas: UInt32, public readonly l2Gas: UInt32) {}

  static get schema() {
    return z
      .object({
        daGas: schemas.UInt32,
        l2Gas: schemas.UInt32,
      })
      .transform(Gas.from);
  }

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

  static random() {
    return new Gas(Math.floor(Math.random() * 1e9), Math.floor(Math.random() * 1e9));
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
}
