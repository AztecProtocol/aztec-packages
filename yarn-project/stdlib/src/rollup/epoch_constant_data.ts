import { Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import type { FieldsOf } from '@aztec/foundation/types';

/**
 * Constants that are the same for the entire epoch.
 */
export class EpochConstantData {
  constructor(
    /**
     * Root of the verification key tree.
     */
    public vkTreeRoot: Fr,
    /**
     * Root of the protocol contract tree.
     */
    public protocolContractTreeRoot: Fr,
    /**
     * Identifier of the prover of the epoch.
     */
    public proverId: Fr,
  ) {}

  static from(fields: FieldsOf<EpochConstantData>): EpochConstantData {
    return new EpochConstantData(...EpochConstantData.getFields(fields));
  }

  static fromBuffer(buffer: Buffer | BufferReader): EpochConstantData {
    const reader = BufferReader.asReader(buffer);
    return new EpochConstantData(Fr.fromBuffer(reader), Fr.fromBuffer(reader), Fr.fromBuffer(reader));
  }

  static getFields(fields: FieldsOf<EpochConstantData>) {
    return [fields.vkTreeRoot, fields.protocolContractTreeRoot, fields.proverId] as const;
  }

  static empty() {
    return new EpochConstantData(Fr.ZERO, Fr.ZERO, Fr.ZERO);
  }

  toBuffer() {
    return serializeToBuffer(...EpochConstantData.getFields(this));
  }
}
