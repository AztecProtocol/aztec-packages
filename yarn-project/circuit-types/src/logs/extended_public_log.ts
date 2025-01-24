import { PublicLog } from '@aztec/circuits.js';
import { BufferReader } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';
import { type FieldsOf } from '@aztec/foundation/types';

import isEqual from 'lodash.isequal';
import { z } from 'zod';

import { LogId } from './log_id.js';

/**
 * Represents an individual public log entry extended with info about the block and tx it was emitted in.
 */
export class ExtendedPublicLog {
  constructor(
    /** Globally unique id of the log. */
    public readonly id: LogId,
    /** The data contents of the log. */
    public readonly log: PublicLog,
  ) {}

  static async random() {
    return new ExtendedPublicLog(LogId.random(), await PublicLog.random());
  }

  static get schema() {
    return z
      .object({
        id: LogId.schema,
        log: PublicLog.schema,
      })
      .transform(ExtendedPublicLog.from);
  }

  static from(fields: FieldsOf<ExtendedPublicLog>) {
    return new ExtendedPublicLog(fields.id, fields.log);
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
   * Serializes log to a human readable string.
   * @returns A human readable representation of the log.
   */
  public toHumanReadable(): string {
    return `${this.id.toHumanReadable()}, ${this.log.toHumanReadable()}`;
  }

  /**
   * Checks if two ExtendedPublicLog objects are equal.
   * @param other - Another ExtendedPublicLog object to compare with.
   * @returns True if the two objects are equal, false otherwise.
   */
  public equals(other: ExtendedPublicLog): boolean {
    return isEqual(this, other);
  }

  /**
   * Deserializes log from a buffer.
   * @param buffer - The buffer or buffer reader containing the log.
   * @returns Deserialized instance of `Log`.
   */
  public static fromBuffer(buffer: Buffer | BufferReader): ExtendedPublicLog {
    const reader = BufferReader.asReader(buffer);

    const logId = LogId.fromBuffer(reader);
    const log = PublicLog.fromBuffer(reader);

    return new ExtendedPublicLog(logId, log);
  }

  /**
   * Deserializes `ExtendedPublicLog` object from a hex string representation.
   * @param data - A hex string representation of the log.
   * @returns An `ExtendedPublicLog` object.
   */
  public static fromString(data: string): ExtendedPublicLog {
    return ExtendedPublicLog.fromBuffer(hexToBuffer(data));
  }
}
