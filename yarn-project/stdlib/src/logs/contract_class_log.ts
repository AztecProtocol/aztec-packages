import { CONTRACT_CLASS_LOG_DATA_SIZE_IN_FIELDS, CONTRACT_CLASS_LOG_SIZE_IN_FIELDS } from '@aztec/constants';
import { poseidon2Hash } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { schemas } from '@aztec/foundation/schemas';
import { BufferReader, FieldReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { inspect } from 'util';
import { z } from 'zod';

import { AztecAddress } from '../aztec-address/index.js';

export class ContractClassLog {
  static SIZE_IN_BYTES = Fr.SIZE_IN_BYTES * CONTRACT_CLASS_LOG_SIZE_IN_FIELDS;

  // Below line gives error 'Type instantiation is excessively deep and possibly infinite. ts(2589)'
  // public fields: Tuple<Fr, typeof CONTRACT_CLASS_LOG_DATA_SIZE_IN_FIELDS>
  constructor(public contractAddress: AztecAddress, public fields: Fr[]) {
    if (fields.length !== CONTRACT_CLASS_LOG_DATA_SIZE_IN_FIELDS) {
      throw new Error(
        `Invalid number of fields for ContractClassLog. Expected ${CONTRACT_CLASS_LOG_DATA_SIZE_IN_FIELDS}, got ${fields.length}`,
      );
    }
  }

  toFields(): Fr[] {
    return [this.contractAddress.toField(), ...this.fields];
  }

  static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    // Below line gives error 'Type instantiation is excessively deep and possibly infinite. ts(2589)'
    // return new ContractClassLog(reader.readFieldArray(CONTRACT_CLASS_LOG_SIZE_IN_FIELDS));
    return new ContractClassLog(
      reader.readObject(AztecAddress),
      Array.from({ length: CONTRACT_CLASS_LOG_DATA_SIZE_IN_FIELDS }, () => reader.readField()),
    );
  }

  isEmpty() {
    return this.fields.every(f => f.isZero());
  }

  static empty() {
    return new ContractClassLog(AztecAddress.ZERO, new Array(CONTRACT_CLASS_LOG_DATA_SIZE_IN_FIELDS).fill(Fr.ZERO));
  }

  toBuffer(): Buffer {
    return serializeToBuffer([this.contractAddress, this.fields]);
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    // Below line gives error 'Type instantiation is excessively deep and possibly infinite. ts(2589)'
    // reader.readArray(CONTRACT_CLASS_LOG_SIZE_IN_FIELDS, Fr);
    const address = reader.readObject(AztecAddress);
    const fields = Array.from({ length: CONTRACT_CLASS_LOG_DATA_SIZE_IN_FIELDS }, () =>
      reader.remainingBytes() == 0 ? Fr.ZERO : Fr.fromBuffer(reader),
    );
    return new ContractClassLog(address, fields);
  }

  clone() {
    return ContractClassLog.fromBuffer(this.toBuffer());
  }

  static async random() {
    // TODO(MW): Lazily used /2 instead of CONTRACT_CLASS_LOG_DATA_SIZE_IN_FIELDS, because this keeps overfilling block blobs
    // Below line gives error 'Type instantiation is excessively deep and possibly infinite. ts(2589)'
    // makeTuple(CONTRACT_CLASS_LOG_DATA_SIZE_IN_FIELDS, Fr.random);
    const fields = Array.from({ length: Math.ceil(CONTRACT_CLASS_LOG_DATA_SIZE_IN_FIELDS / 2) }, () => Fr.random());
    return new ContractClassLog(
      await AztecAddress.random(),
      fields.concat(Array.from({ length: Math.floor(CONTRACT_CLASS_LOG_DATA_SIZE_IN_FIELDS / 2) }, () => Fr.ZERO)),
    );
  }

  getEmittedLength() {
    // This assumes that we cut trailing zeroes from the end of the log. In ts, these will always be added back.
    // Does not include address and length prefix.
    return this.getEmittedFields().length;
  }

  getEmittedFields() {
    let lastZeroIndex = 0;
    for (let i = this.fields.length - 1; i >= 0; i--) {
      if (!this.fields[i].isZero() && lastZeroIndex == 0) {
        lastZeroIndex = i + 1;
        break;
      }
    }
    return this.fields.slice(0, lastZeroIndex);
  }

  async hash() {
    return await poseidon2Hash(this.getEmittedFields());
  }

  static get schema() {
    return z
      .object({
        contractAddress: AztecAddress.schema,
        fields: z.array(schemas.Fr),
      })
      .transform(({ contractAddress, fields }) => ContractClassLog.fromFields([contractAddress.toField(), ...fields]));
  }

  [inspect.custom](): string {
    return `ContractClassLog {
      fields: [${this.fields.map((x: Fr) => inspect(x)).join(', ')}],
    }`;
  }
}
