import { Fr } from '@aztec/foundation/curves/bn254';
import { schemas } from '@aztec/foundation/schemas';
import { BufferReader, BufferSink, FieldReader, serializeToFields } from '@aztec/foundation/serialize';
import type { FieldsOf } from '@aztec/foundation/types';

import { inspect } from 'util';
import { z } from 'zod';

import type { UInt128 } from '../types/shared.js';
import type { GasDimensions } from './gas.js';

/**
 * Multiplies a bigint by a non-integer scalar and returns the ceiling of the result.
 * Avoids converting the bigint to Number (which loses precision above 2^53) by instead
 * scaling the scalar into a bigint rational and performing ceiling division.
 */
function bigintMulCeil(value: bigint, scalar: number): bigint {
  const SCALE = 1_000_000_000_000n; // 1e12
  const scaledScalar = BigInt(Math.round(scalar * 1e12));
  return (value * scaledScalar + SCALE - 1n) / SCALE;
}

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
    } else if (Number.isInteger(scalar)) {
      const s = BigInt(scalar);
      return new GasFees(this.feePerDaGas * s, this.feePerL2Gas * s);
    } else {
      return new GasFees(bigintMulCeil(this.feePerDaGas, scalar), bigintMulCeil(this.feePerL2Gas, scalar));
    }
  }

  static from(fields: FieldsOf<GasFees>) {
    return new GasFees(fields.feePerDaGas, fields.feePerL2Gas);
  }

  /**
   * Creates a GasFees instance from a plain object without Zod validation.
   * This method is optimized for performance and skips validation, making it suitable
   * for deserializing trusted data (e.g., from C++ via MessagePack).
   * @param obj - Plain object containing GasFees fields
   * @returns A GasFees instance
   */
  static fromPlainObject(obj: any): GasFees {
    if (obj instanceof GasFees) {
      return obj;
    }
    return GasFees.from(obj);
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

  toBuffer(): Buffer;
  toBuffer(sink: BufferSink): void;
  toBuffer(sink?: BufferSink): Buffer | void {
    if (!sink) {
      return BufferSink.serialize(this);
    }
    sink.writeBigInt(this.feePerDaGas, 16);
    sink.writeBigInt(this.feePerL2Gas, 16);
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

/** Provides projected minimum gas fees for the next block. */
export interface BlockMinFeesProvider {
  getCurrentMinFees(): Promise<GasFees>;
}
