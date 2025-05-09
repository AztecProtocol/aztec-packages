import { CONTRACT_CLASS_LOG_LENGTH, CONTRACT_CLASS_LOG_SIZE_IN_FIELDS } from '@aztec/constants';
import { poseidon2Hash } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { schemas } from '@aztec/foundation/schemas';
import { BufferReader, FieldReader, serializeToBuffer, serializeToFields } from '@aztec/foundation/serialize';
import type { FieldsOf } from '@aztec/foundation/types';

import { inspect } from 'util';
import { z } from 'zod';

import { AztecAddress } from '../aztec-address/index.js';

export class ContractClassLogFields {
  // Below line gives error 'Type instantiation is excessively deep and possibly infinite. ts(2589)'
  // public fields: Tuple<Fr, typeof CONTRACT_CLASS_LOG_SIZE_IN_FIELDS>
  constructor(public fields: Fr[]) {
    if (fields.length !== CONTRACT_CLASS_LOG_SIZE_IN_FIELDS) {
      throw new Error(
        `Invalid number of fields for ContractClassLog. Expected ${CONTRACT_CLASS_LOG_SIZE_IN_FIELDS}, got ${fields.length}`,
      );
    }
  }

  static get schema() {
    return z
      .object({
        fields: z.array(schemas.Fr).refine(arr => arr.length === CONTRACT_CLASS_LOG_SIZE_IN_FIELDS),
      })
      .transform(({ fields }) => new ContractClassLogFields(fields));
  }

  toFields(): Fr[] {
    return this.fields;
  }

  static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    // Below line gives error 'Type instantiation is excessively deep and possibly infinite. ts(2589)'
    // reader.readFieldArray(CONTRACT_CLASS_LOG_LENGTH);
    return new ContractClassLogFields(
      Array.from({ length: CONTRACT_CLASS_LOG_SIZE_IN_FIELDS }, () => reader.readField()),
    );
  }

  toBuffer() {
    return serializeToBuffer(this.fields);
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    // Below line gives error 'Type instantiation is excessively deep and possibly infinite. ts(2589)'
    // reader.readArray(CONTRACT_CLASS_LOG_SIZE_IN_FIELDS, Fr)
    return new ContractClassLogFields(
      Array.from({ length: CONTRACT_CLASS_LOG_SIZE_IN_FIELDS }, () => reader.readObject(Fr)),
    );
  }

  equals(other: ContractClassLogFields) {
    return this.fields.every((f, i) => f.equals(other.fields[i]));
  }

  getEmittedFields(emittedLength: number) {
    return this.fields.slice(0, emittedLength);
  }

  static fromEmittedFields(emittedFields: Fr[]) {
    return new ContractClassLogFields(
      emittedFields.concat(Array(CONTRACT_CLASS_LOG_SIZE_IN_FIELDS - emittedFields.length).fill(Fr.ZERO)),
    );
  }

  isEmpty() {
    return this.fields.every(f => f.isZero());
  }

  static empty() {
    return new ContractClassLogFields(Array(CONTRACT_CLASS_LOG_SIZE_IN_FIELDS).fill(Fr.ZERO));
  }

  static random(emittedLength = CONTRACT_CLASS_LOG_SIZE_IN_FIELDS) {
    return new ContractClassLogFields(
      Array.from({ length: emittedLength }, () => Fr.random()).concat(
        Array(CONTRACT_CLASS_LOG_SIZE_IN_FIELDS - emittedLength).fill(Fr.ZERO),
      ),
    );
  }

  async hash() {
    return await poseidon2Hash(this.fields);
  }

  clone() {
    return ContractClassLogFields.fromBuffer(this.toBuffer());
  }
}

export class ContractClassLog {
  static SIZE_IN_BYTES = Fr.SIZE_IN_BYTES * CONTRACT_CLASS_LOG_LENGTH;
  // Keeps original first field pre-siloing. Only set by silo().
  public unsiloedFirstField?: Fr | undefined;

  constructor(
    public contractAddress: AztecAddress,
    public fields: ContractClassLogFields,
    public emittedLength: number,
  ) {}

  static from(fields: FieldsOf<ContractClassLog>) {
    return new ContractClassLog(fields.contractAddress, fields.fields, fields.emittedLength);
  }

  toFields(): Fr[] {
    return serializeToFields([this.contractAddress, this.fields, this.emittedLength]);
  }

  equals(other: ContractClassLog) {
    return (
      this.contractAddress.equals(other.contractAddress) &&
      this.fields.equals(other.fields) &&
      this.emittedLength === other.emittedLength
    );
  }

  static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    return new ContractClassLog(
      reader.readObject(AztecAddress),
      reader.readObject(ContractClassLogFields),
      reader.readU32(),
    );
  }

  getEmittedFields() {
    return this.fields.getEmittedFields(this.emittedLength);
  }

  toBlobFields(): Fr[] {
    return [new Fr(this.emittedLength), this.contractAddress.toField()].concat(this.getEmittedFields());
  }

  static fromBlobFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    const emittedLength = reader.readU32();
    const contractAddress = reader.readObject(AztecAddress);
    const emittedFields = reader.readFieldArray(emittedLength);
    return new ContractClassLog(
      contractAddress,
      ContractClassLogFields.fromEmittedFields(emittedFields),
      emittedLength,
    );
  }

  isEmpty() {
    return this.contractAddress.isZero() && this.fields.isEmpty() && this.emittedLength === 0;
  }

  static empty() {
    return new ContractClassLog(AztecAddress.ZERO, ContractClassLogFields.empty(), 0);
  }

  toBuffer(): Buffer {
    return serializeToBuffer([this.contractAddress, this.fields, this.emittedLength]);
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    const address = reader.readObject(AztecAddress);
    const fields = ContractClassLogFields.fromBuffer(reader);
    const emittedLength = reader.readNumber();
    return new ContractClassLog(address, fields, emittedLength);
  }

  static async random() {
    // NB: Using half the maximum number of fields per log because max fields keeps overfilling blobs in tests.
    const emittedLength = Math.ceil(CONTRACT_CLASS_LOG_SIZE_IN_FIELDS / 2);
    return new ContractClassLog(
      await AztecAddress.random(),
      ContractClassLogFields.random(emittedLength),
      emittedLength,
    );
  }

  setUnsiloedFirstField(field: Fr) {
    this.unsiloedFirstField = field;
  }

  toUnsiloed() {
    if (this.contractAddress.isZero()) {
      return this;
    }
    if (this.unsiloedFirstField) {
      return new ContractClassLog(
        this.contractAddress,
        new ContractClassLogFields([this.unsiloedFirstField].concat(this.fields.fields.slice(1))),
        this.emittedLength,
      );
    } else {
      return this;
    }
  }

  // TODO(#13914): Don't need to silo the contract class logs.
  async silo() {
    if (this.contractAddress.isZero()) {
      return this;
    }

    const fields = this.fields.clone();
    const unsiloedField = fields.fields[0];
    const siloedField = await poseidon2Hash([this.contractAddress, unsiloedField]);
    fields.fields[0] = siloedField;
    const cloned = new ContractClassLog(this.contractAddress, fields, this.emittedLength);
    cloned.setUnsiloedFirstField(unsiloedField);
    return cloned;
  }

  async hash() {
    return await this.fields.hash();
  }

  static get schema() {
    return z
      .object({
        contractAddress: AztecAddress.schema,
        fields: ContractClassLogFields.schema,
        emittedLength: z.number(),
      })
      .transform(ContractClassLog.from);
  }

  [inspect.custom](): string {
    return `ContractClassLog {
      contractAddress: ${this.contractAddress.toString()},
      emittedLength: ${this.emittedLength},
      fields: [${this.fields.fields.map((x: Fr) => inspect(x)).join(', ')}],
    }`;
  }
}
