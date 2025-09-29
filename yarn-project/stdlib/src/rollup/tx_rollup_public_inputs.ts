import { SpongeBlob } from '@aztec/blob-lib/types';
import { Fr } from '@aztec/foundation/fields';
import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';

import { PartialStateReference } from '../tx/partial_state_reference.js';
import { BlockConstantData } from './block_constant_data.js';

/**
 * Output of the base and merge rollup circuits.
 */
export class TxRollupPublicInputs {
  constructor(
    /**
     * Number of txs in this rollup.
     */
    public numTxs: number,
    /**
     * Data which is forwarded through the rollup circuits unchanged.
     */
    public constants: BlockConstantData,
    /**
     * Partial state reference at the start of the rollup circuit.
     */
    public startTreeSnapshots: PartialStateReference,
    /**
     * Partial state reference at the end of the rollup circuit.
     */
    public endTreeSnapshots: PartialStateReference,
    /**
     * Sponge state to absorb blob inputs at the start of the rollup circuit.
     */
    public startSpongeBlob: SpongeBlob,
    /**
     * Sponge state to absorb blob inputs at the end of the rollup circuit.
     */
    public endSpongeBlob: SpongeBlob,
    /**
     * SHA256 hash of L2 to L1 messages. Used to make public inputs constant-sized (to then be opened onchain).
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
    return new TxRollupPublicInputs(
      0,
      BlockConstantData.empty(),
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
  static fromBuffer(buffer: Buffer | BufferReader): TxRollupPublicInputs {
    const reader = BufferReader.asReader(buffer);
    return new TxRollupPublicInputs(
      reader.readNumber(),
      reader.readObject(BlockConstantData),
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
      this.numTxs,
      this.constants,

      this.startTreeSnapshots,
      this.endTreeSnapshots,

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
   * @returns A new TxRollupPublicInputs instance.
   */
  static fromString(str: string) {
    return TxRollupPublicInputs.fromBuffer(hexToBuffer(str));
  }

  /** Returns a buffer representation for JSON serialization. */
  toJSON() {
    return this.toBuffer();
  }

  /** Creates an instance from a hex string. */
  static get schema() {
    return bufferSchemaFor(TxRollupPublicInputs);
  }
}
