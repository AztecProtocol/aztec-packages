import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { schemas } from '@aztec/foundation/schemas';
import { BufferReader, FieldReader, serializeToBuffer, serializeToFields } from '@aztec/foundation/serialize';

import { z } from 'zod';

import { AztecAddress } from '../aztec-address/index.js';

export class L2ToL1Message {
  constructor(
    public recipient: EthAddress,
    public content: Fr,
  ) {}

  static get schema() {
    return z
      .object({
        recipient: schemas.EthAddress,
        content: schemas.Fr,
      })
      .transform(({ recipient, content }) => new L2ToL1Message(recipient, content));
  }

  /**
   * Creates an empty L2ToL1Message with default values.
   * @returns An instance of L2ToL1Message with empty fields.
   */
  static empty(): L2ToL1Message {
    return new L2ToL1Message(EthAddress.ZERO, Fr.zero());
  }

  /**
   * Checks if another L2ToL1Message is equal to this instance.
   * @param other Another L2ToL1Message instance to compare with.
   * @returns True if both recipient and content are equal.
   */
  equals(other: L2ToL1Message): boolean {
    return this.recipient.equals(other.recipient) && this.content.equals(other.content);
  }

  /**
   * Serialize this as a buffer.
   * @returns The buffer.
   */
  toBuffer(): Buffer {
    return serializeToBuffer(this.recipient, this.content);
  }

  /**
   * Serializes the L2ToL1Message into an array of fields.
   * @returns An array of fields representing the serialized message.
   */
  toFields(): Fr[] {
    return [this.recipient.toField(), this.content];
  }

  /**
   * Deserializes an array of fields into an L2ToL1Message instance.
   * @param fields An array of fields to deserialize from.
   * @returns An instance of L2ToL1Message.
   */
  static fromFields(fields: Fr[] | FieldReader): L2ToL1Message {
    const reader = FieldReader.asReader(fields);
    return new L2ToL1Message(reader.readObject(EthAddress), reader.readField());
  }

  /**
   * Deserializes from a buffer or reader.
   * @param buffer - Buffer or reader to read from.
   * @returns A new instance of L2ToL1Message.
   */
  static fromBuffer(buffer: Buffer | BufferReader): L2ToL1Message {
    const reader = BufferReader.asReader(buffer);
    return new L2ToL1Message(reader.readObject(EthAddress), reader.readObject(Fr));
  }

  /**
   * Convenience method to check if the message is empty.
   * @returns True if both recipient and content are zero.
   */
  isEmpty(): boolean {
    return this.recipient.isZero() && this.content.isZero();
  }

  scope(contractAddress: AztecAddress): ScopedL2ToL1Message {
    return new ScopedL2ToL1Message(this, contractAddress);
  }
}

export class CountedL2ToL1Message {
  constructor(
    public message: L2ToL1Message,
    public counter: number,
  ) {}

  static get schema() {
    return z
      .object({
        message: L2ToL1Message.schema,
        counter: z.number().int().nonnegative(),
      })
      .transform(({ message, counter }) => new CountedL2ToL1Message(message, counter));
  }

  static empty() {
    return new CountedL2ToL1Message(L2ToL1Message.empty(), 0);
  }

  isEmpty(): boolean {
    return this.message.isEmpty() && !this.counter;
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new CountedL2ToL1Message(reader.readObject(L2ToL1Message), reader.readNumber());
  }

  toBuffer(): Buffer {
    return serializeToBuffer(this.message, this.counter);
  }

  static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    return new CountedL2ToL1Message(reader.readObject(L2ToL1Message), reader.readU32());
  }

  toFields(): Fr[] {
    return serializeToFields(this.message, this.counter);
  }
}

export class ScopedL2ToL1Message {
  constructor(
    public message: L2ToL1Message,
    public contractAddress: AztecAddress,
  ) {}

  static get schema() {
    return z
      .object({
        message: L2ToL1Message.schema,
        contractAddress: AztecAddress.schema,
      })
      .transform(({ message, contractAddress }) => new ScopedL2ToL1Message(message, contractAddress));
  }

  static empty() {
    return new ScopedL2ToL1Message(L2ToL1Message.empty(), AztecAddress.ZERO);
  }

  isEmpty(): boolean {
    return this.message.isEmpty() && this.contractAddress.isZero();
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new ScopedL2ToL1Message(reader.readObject(L2ToL1Message), reader.readObject(AztecAddress));
  }

  toBuffer(): Buffer {
    return serializeToBuffer(this.message, this.contractAddress);
  }

  static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    return new ScopedL2ToL1Message(reader.readObject(L2ToL1Message), reader.readObject(AztecAddress));
  }

  toFields(): Fr[] {
    return serializeToFields(this.message, this.contractAddress);
  }
}

export class ScopedCountedL2ToL1Message {
  constructor(
    public inner: CountedL2ToL1Message,
    public contractAddress: AztecAddress,
  ) {}

  static get schema() {
    return z
      .object({
        inner: CountedL2ToL1Message.schema,
        contractAddress: AztecAddress.schema,
      })
      .transform(({ inner, contractAddress }) => new ScopedCountedL2ToL1Message(inner, contractAddress));
  }

  static empty() {
    return new ScopedCountedL2ToL1Message(CountedL2ToL1Message.empty(), AztecAddress.ZERO);
  }

  isEmpty(): boolean {
    return this.inner.isEmpty() && this.contractAddress.isZero();
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new ScopedCountedL2ToL1Message(reader.readObject(CountedL2ToL1Message), reader.readObject(AztecAddress));
  }

  toBuffer(): Buffer {
    return serializeToBuffer(this.inner, this.contractAddress);
  }
}
