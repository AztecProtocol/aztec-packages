import { Fr } from '@aztec/foundation/fields';
import { schemas } from '@aztec/foundation/schemas';
import {
  BufferReader,
  FieldReader,
  bigintToUInt128BE,
  serializeToBuffer,
  serializeToFields,
} from '@aztec/foundation/serialize';
import type { FieldsOf } from '@aztec/foundation/types';

import { inspect } from 'util';
import { z } from 'zod';

import type { UInt128 } from '../types/shared.js';
import type { GasDimensions } from './gas.js';

/** Gas prices for each dimension. */
export class GasFees {
  public readonly feePerDaGas: UInt128;
  public readonly feePerL2Gas: UInt128;

  constructor(feePerDaGas: number | bigint, feePerL2Gas: number | bigint) {
    this.feePerDaGas = BigInt(feePerDaGas);
    this.feePerL2Gas = BigInt(feePerL2Gas);
  }

  static get schema() {
    return z
      .object({
        feePerDaGas: schemas.BigInt,
        feePerL2Gas: schemas.BigInt,
      })
      .transform(GasFees.from);
  }

  clone(): GasFees {
    return new GasFees(this.feePerDaGas, this.feePerL2Gas);
  }

  equals(other: GasFees) {
    return this.feePerDaGas === other.feePerDaGas && this.feePerL2Gas === other.feePerL2Gas;
  }

  get(dimension: GasDimensions) {
    switch (dimension) {
      case 'da':
        return this.feePerDaGas;
      case 'l2':
        return this.feePerL2Gas;
    }
  }

  mul(scalar: number | bigint) {
    if (scalar === 1 || scalar === 1n) {
      return this.clone();
    } else if (typeof scalar === 'bigint') {
      return new GasFees(this.feePerDaGas * scalar, this.feePerL2Gas * scalar);
    } else {
      return new GasFees(Number(this.feePerDaGas) * scalar, Number(this.feePerL2Gas) * scalar);
    }
  }

  static from(fields: FieldsOf<GasFees>) {
    return new GasFees(fields.feePerDaGas, fields.feePerL2Gas);
  }

  static random() {
    return new GasFees(Math.floor(Math.random() * 1e9), Math.floor(Math.random() * 1e9));
  }

  static empty() {
    return new GasFees(0, 0);
  }

  isEmpty() {
    return this.feePerDaGas === 0n && this.feePerL2Gas === 0n;
  }

  static fromBuffer(buffer: Buffer | BufferReader): GasFees {
    const reader = BufferReader.asReader(buffer);
    return new GasFees(reader.readUInt128(), reader.readUInt128());
  }

  toBuffer() {
    return serializeToBuffer(bigintToUInt128BE(this.feePerDaGas), bigintToUInt128BE(this.feePerL2Gas));
  }

  static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    return new GasFees(reader.readField().toBigInt(), reader.readField().toBigInt());
  }

  toFields() {
    return serializeToFields(this.feePerDaGas, this.feePerL2Gas);
  }

  toInspect() {
    return {
      feePerDaGas: this.feePerDaGas,
      feePerL2Gas: this.feePerL2Gas,
    };
  }

  [inspect.custom]() {
    return `GasFees { feePerDaGas=${this.feePerDaGas} feePerL2Gas=${this.feePerL2Gas} }`;
  }
}
