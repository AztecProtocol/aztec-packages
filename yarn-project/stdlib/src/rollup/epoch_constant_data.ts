import { Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer, serializeToFields } from '@aztec/foundation/serialize';
import type { FieldsOf } from '@aztec/foundation/types';

/**
 * Constants that are the same for the entire epoch.
 */
export class EpochConstantData {
  constructor(
    /**
     * ChainId of the rollup.
     */
    public chainId: Fr,
    /**
     * Version of the rollup.
     */
    public version: Fr,
    /**
     * Root of the verification key tree.
     */
    public vkTreeRoot: Fr,
    /**
     * Hash of the protocol contracts list.
     */
    public protocolContractsHash: Fr,
    /**
     * Identifier of the prover of the epoch.
     */
    public proverId: Fr,
  ) {}

  static from(fields: FieldsOf<EpochConstantData>): EpochConstantData {
    return new EpochConstantData(...EpochConstantData.getFields(fields));
  }

  static getFields(fields: FieldsOf<EpochConstantData>) {
    return [fields.chainId, fields.version, fields.vkTreeRoot, fields.protocolContractsHash, fields.proverId] as const;
  }

  toFields(): Fr[] {
    return serializeToFields(...EpochConstantData.getFields(this));
  }

  static fromBuffer(buffer: Buffer | BufferReader): EpochConstantData {
    const reader = BufferReader.asReader(buffer);
    return new EpochConstantData(
      Fr.fromBuffer(reader),
      Fr.fromBuffer(reader),
      Fr.fromBuffer(reader),
      Fr.fromBuffer(reader),
      Fr.fromBuffer(reader),
    );
  }

  toBuffer() {
    return serializeToBuffer(...EpochConstantData.getFields(this));
  }

  static empty() {
    return new EpochConstantData(Fr.ZERO, Fr.ZERO, Fr.ZERO, Fr.ZERO, Fr.ZERO);
  }
}
