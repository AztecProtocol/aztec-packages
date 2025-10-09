import { GeneratorIndex, MAX_PROTOCOL_CONTRACTS } from '@aztec/constants';
import { makeTuple } from '@aztec/foundation/array';
import { arraySerializedSizeOfNonEmpty } from '@aztec/foundation/collection';
import { poseidon2HashWithSeparator } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import {
  BufferReader,
  FieldReader,
  type Tuple,
  assertLength,
  serializeToBuffer,
  serializeToFields,
} from '@aztec/foundation/serialize';
import type { FieldsOf } from '@aztec/foundation/types';

import { z } from 'zod';

import { AztecAddress } from '../aztec-address/index.js';

export class ProtocolContracts {
  constructor(public derivedAddresses: Tuple<AztecAddress, typeof MAX_PROTOCOL_CONTRACTS>) {}

  static from(fields: FieldsOf<ProtocolContracts>) {
    return new ProtocolContracts(...ProtocolContracts.getFields(fields));
  }

  static getFields(fields: FieldsOf<ProtocolContracts>) {
    return [fields.derivedAddresses] as const;
  }

  static fromFields(fields: Fr[] | FieldReader): ProtocolContracts {
    const reader = FieldReader.asReader(fields);
    return new ProtocolContracts(reader.readArray(MAX_PROTOCOL_CONTRACTS, AztecAddress));
  }

  toFields(): Fr[] {
    return serializeToFields(...ProtocolContracts.getFields(this));
  }

  static fromBuffer(buffer: Buffer | BufferReader): ProtocolContracts {
    const reader = BufferReader.asReader(buffer);
    return new ProtocolContracts(reader.readArray(MAX_PROTOCOL_CONTRACTS, AztecAddress));
  }

  toBuffer() {
    return serializeToBuffer(...ProtocolContracts.getFields(this));
  }

  static empty() {
    return new ProtocolContracts(makeTuple(MAX_PROTOCOL_CONTRACTS, () => AztecAddress.zero()));
  }

  getSize() {
    return arraySerializedSizeOfNonEmpty(this.derivedAddresses);
  }

  hash() {
    return poseidon2HashWithSeparator(this.derivedAddresses, GeneratorIndex.PROTOCOL_CONTRACTS);
  }

  static get schema() {
    return z
      .object({
        derivedAddresses: AztecAddress.schema.array().min(MAX_PROTOCOL_CONTRACTS).max(MAX_PROTOCOL_CONTRACTS),
      })
      .transform(
        ({ derivedAddresses }) => new ProtocolContracts(assertLength(derivedAddresses, MAX_PROTOCOL_CONTRACTS)),
      );
  }
}
