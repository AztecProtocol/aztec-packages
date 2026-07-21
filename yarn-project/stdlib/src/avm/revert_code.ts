import { Fr } from '@aztec/foundation/curves/bn254';
import type { ZodFor } from '@aztec/foundation/schemas';
import { BufferReader, FieldReader } from '@aztec/foundation/serialize';

import { inspect } from 'util';
import { z } from 'zod';

/** Whether a transaction's public execution reverted. */
export enum RevertCodeEnum {
  /** All phases completed successfully; no state was rolled back. */
  OK = 0,
  /** One or more revertible phases reverted; their state changes were discarded. */
  REVERTED = 1,
}

/** Returns a valid RevertCodeEnum, coercing any value >= 1 to REVERTED. */
function toRevertCodeEnum(value: number): RevertCodeEnum {
  return value >= 1 ? RevertCodeEnum.REVERTED : RevertCodeEnum.OK;
}

/**
 * Wrapper class over a field to safely represent a revert code.
 */
export class RevertCode {
  private code: number;
  private constructor(e: RevertCodeEnum) {
    this.code = e.valueOf();
  }
  static readonly OK: RevertCode = new RevertCode(RevertCodeEnum.OK);
  static readonly REVERTED: RevertCode = new RevertCode(RevertCodeEnum.REVERTED);

  public getCode(): RevertCodeEnum {
    return this.code;
  }

  public equals(other: RevertCode): boolean {
    return this.code === other.code;
  }

  public isOK(): boolean {
    return this.equals(RevertCode.OK);
  }

  public getDescription() {
    switch (this.code as RevertCodeEnum) {
      case RevertCodeEnum.OK:
        return 'OK';
      case RevertCodeEnum.REVERTED:
        return 'Reverted';
      default:
        return `Unknown RevertCode: ${this.code}`;
    }
  }

  public toJSON() {
    return this.code;
  }

  static get schema(): ZodFor<RevertCode> {
    return z
      .number()
      .int()
      .min(0)
      .transform(value => new RevertCode(toRevertCodeEnum(value)));
  }

  /**
   * Creates a RevertCode from a plain object without Zod validation.
   * This method is optimized for performance and skips validation, making it suitable
   * for deserializing trusted data (e.g., from C++ via MessagePack).
   * @param obj - Plain object, number, or RevertCode instance
   * @returns A RevertCode instance
   */
  static fromPlainObject(obj: any): RevertCode {
    if (obj instanceof RevertCode) {
      return obj;
    }
    const code = typeof obj === 'number' ? obj : (obj.code ?? obj);
    if (typeof code !== 'number' || code < 0) {
      throw new Error(`Invalid RevertCode: ${code}`);
    }
    return new RevertCode(toRevertCodeEnum(code));
  }

  /**
   * Having different serialization methods allows for
   * decoupling the serialization for producing the content commitment hash
   * (where we use fields)
   * from serialization for transmitting the data.
   */

  private static readonly PREIMAGE_SIZE_IN_BYTES = 32;
  public toHashPreimage(): Buffer {
    const padding = Buffer.alloc(RevertCode.PREIMAGE_SIZE_IN_BYTES - RevertCode.PACKED_SIZE_IN_BYTES);
    return Buffer.concat([padding, this.toBuffer()]);
  }

  private static readonly PACKED_SIZE_IN_BYTES = 1;
  public toBuffer(): Buffer {
    const b = Buffer.alloc(RevertCode.PACKED_SIZE_IN_BYTES);
    b.writeUInt8(this.code, 0);
    return b;
  }

  public toField(): Fr {
    return new Fr(this.toBuffer());
  }

  public getSerializedLength(): number {
    return this.toBuffer().length;
  }

  public static fromNumber(code: number): RevertCode {
    if (code < 0) {
      throw new Error(`Invalid RevertCode: ${code}`);
    }
    return new RevertCode(toRevertCodeEnum(code));
  }

  public static fromField(field: Fr): RevertCode {
    return RevertCode.fromNumber(field.toNumber());
  }

  public static fromFields(fields: Fr[] | FieldReader): RevertCode {
    const reader = FieldReader.asReader(fields);
    return RevertCode.fromField(reader.readField());
  }

  public static fromBuffer(buffer: Buffer | BufferReader): RevertCode {
    const reader = BufferReader.asReader(buffer);
    const code = reader.readBytes(RevertCode.PACKED_SIZE_IN_BYTES).readUInt8(0);
    return RevertCode.fromNumber(code);
  }

  private static readonly NUM_OPTIONS = 2;
  static random(): RevertCode {
    return new RevertCode(Math.floor(Math.random() * RevertCode.NUM_OPTIONS));
  }

  [inspect.custom]() {
    return `RevertCode<${this.code.toString()}>`;
  }
}
