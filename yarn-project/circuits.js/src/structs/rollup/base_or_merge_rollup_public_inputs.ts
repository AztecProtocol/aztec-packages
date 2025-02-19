import { Fr } from '@aztec/foundation/fields';
import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';

import { SpongeBlob } from '../blobs/sponge_blob.js';
import { PartialStateReference } from '../partial_state_reference.js';
import { RollupTypes } from '../shared.js';
import { ConstantRollupData } from './constant_rollup_data.js';

/**
 * Output of the base and merge rollup circuits.
 */
export class BaseOrMergeRollupPublicInputs {
  constructor(
    /**
     * Specifies from which type of rollup circuit these inputs are from.
     */
    public rollupType: RollupTypes,
    /**
     * Number of txs in this rollup.
     */
    public numTxs: number,
    /**
     * Data which is forwarded through the rollup circuits unchanged.
     */
    public constants: ConstantRollupData,
    /**
     * Partial state reference at the start of the rollup circuit.
     */
    public start: PartialStateReference,
    /**
     * Partial state reference at the end of the rollup circuit.
     */
    public end: PartialStateReference,
    /**
     * Sponge state to absorb blob inputs at the start of the rollup circuit.
     */
    public startSpongeBlob: SpongeBlob,
    /**
     * Sponge state to absorb blob inputs at the end of the rollup circuit.
     */
    public endSpongeBlob: SpongeBlob,
    /**
     * SHA256 hash of L2 to L1 messages. Used to make public inputs constant-sized (to then be opened on-chain).
     * Note: Truncated to 31 bytes to fit in Fr.
     */
    public outHash: Fr,
    /**
     * The summed `transaction_fee` of the constituent transactions.
     */
    public accumulatedFees: Fr,
    /**
     * The summed `mana_used` of the constituent transactions.
     */
    public accumulatedManaUsed: Fr,
  ) {}

  /** Returns an empty instance. */
  static empty() {
    return new BaseOrMergeRollupPublicInputs(
      RollupTypes.Base,
      0,
      ConstantRollupData.empty(),
      PartialStateReference.empty(),
      PartialStateReference.empty(),
      SpongeBlob.empty(),
      SpongeBlob.empty(),
      Fr.zero(),
      Fr.zero(),
      Fr.zero(),
    );
  }

  /**
   * Deserializes from a buffer or reader.
   * Note: Corresponds to a write in cpp.
   * @param buffer - Buffer or reader to read from.
   * @returns The deserialized public inputs.
   */
  static fromBuffer(buffer: Buffer | BufferReader): BaseOrMergeRollupPublicInputs {
    const reader = BufferReader.asReader(buffer);
    return new BaseOrMergeRollupPublicInputs(
      reader.readNumber(),
      reader.readNumber(),
      reader.readObject(ConstantRollupData),
      reader.readObject(PartialStateReference),
      reader.readObject(PartialStateReference),
      reader.readObject(SpongeBlob),
      reader.readObject(SpongeBlob),
      Fr.fromBuffer(reader),
      Fr.fromBuffer(reader),
      Fr.fromBuffer(reader),
    );
  }

  /**
   * Serialize this as a buffer.
   * @returns The buffer.
   */
  toBuffer() {
    return serializeToBuffer(
      this.rollupType,
      this.numTxs,
      this.constants,

      this.start,
      this.end,

      this.startSpongeBlob,
      this.endSpongeBlob,

      this.outHash,

      this.accumulatedFees,
      this.accumulatedManaUsed,
    );
  }

  /**
   * Serialize this as a hex string.
   * @returns - The hex string.
   */
  toString() {
    return bufferToHex(this.toBuffer());
  }

  /**
   * Deserializes from a hex string.
   * @param str - A hex string to deserialize from.
   * @returns A new BaseOrMergeRollupPublicInputs instance.
   */
  static fromString(str: string) {
    return BaseOrMergeRollupPublicInputs.fromBuffer(hexToBuffer(str));
  }

  /** Returns a buffer representation for JSON serialization. */
  toJSON() {
    return this.toBuffer();
  }

  /** Creates an instance from a hex string. */
  static get schema() {
    return bufferSchemaFor(BaseOrMergeRollupPublicInputs);
  }
}
