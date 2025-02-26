import type { ZodFor } from '@aztec/foundation/schemas';
import { BufferReader } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';
import type { FieldsOf } from '@aztec/foundation/types';

import isEqual from 'lodash.isequal';
import { z } from 'zod';

import { ContractClassLog } from './contract_class_log.js';
import { LogId } from './log_id.js';

/**
 * Represents an individual contract class log entry extended with info about the block and tx it was emitted in.
 */
export class ExtendedContractClassLog {
  constructor(
    /** Globally unique id of the log. */
    public readonly id: LogId,
    /** The data contents of the log. */
    public readonly log: ContractClassLog,
  ) {}

  static async random() {
    return new ExtendedContractClassLog(LogId.random(), await ContractClassLog.random());
  }

  static get schema(): ZodFor<ExtendedContractClassLog> {
    return z
      .object({
        id: LogId.schema,
        log: ContractClassLog.schema,
      })
      .transform(ExtendedContractClassLog.from);
  }

  static from(fields: FieldsOf<ExtendedContractClassLog>) {
    return new ExtendedContractClassLog(fields.id, fields.log);
  }

  /**
   * Serializes log to a buffer.
   * @returns A buffer containing the serialized log.
   */
  public toBuffer(): Buffer {
    return Buffer.concat([this.id.toBuffer(), this.log.toBuffer()]);
  }

  /**
   * Serializes log to a string.
   * @returns A string containing the serialized log.
   */
  public toString(): string {
    return bufferToHex(this.toBuffer());
  }

  /**
   * Checks if two ExtendedContractClassLog objects are equal.
   * @param other - Another ExtendedContractClassLog object to compare with.
   * @returns True if the two objects are equal, false otherwise.
   */
  public equals(other: ExtendedContractClassLog): boolean {
    return isEqual(this, other);
  }

  /**
   * Deserializes log from a buffer.
   * @param buffer - The buffer or buffer reader containing the log.
   * @returns Deserialized instance of `Log`.
   */
  public static fromBuffer(buffer: Buffer | BufferReader): ExtendedContractClassLog {
    const reader = BufferReader.asReader(buffer);

    const logId = LogId.fromBuffer(reader);
    const log = ContractClassLog.fromBuffer(reader);

    return new ExtendedContractClassLog(logId, log);
  }

  /**
   * Deserializes `ExtendedContractClassLog` object from a hex string representation.
   * @param data - A hex string representation of the log.
   * @returns An `ExtendedContractClassLog` object.
   */
  public static fromString(data: string): ExtendedContractClassLog {
    return ExtendedContractClassLog.fromBuffer(hexToBuffer(data));
  }
}
