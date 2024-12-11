import { Fr } from '@aztec/foundation/fields';
import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';
import { type FieldsOf } from '@aztec/foundation/types';

import { GlobalVariables } from '../global_variables.js';
import { AppendOnlyTreeSnapshot } from './append_only_tree_snapshot.js';

/**
 * Represents inputs of the empty block root rollup circuit.
 */
export class EmptyBlockRootRollupInputs {
  constructor(
    public readonly archive: AppendOnlyTreeSnapshot,
    public readonly blockHash: Fr,
    public readonly globalVariables: GlobalVariables,
    public readonly vkTreeRoot: Fr,
    public readonly protocolContractTreeRoot: Fr,
    // // TODO(#7346): Temporarily added prover_id while we verify block-root proofs on L1
    public readonly proverId: Fr,
  ) {}

  /**
   * Serializes the inputs to a buffer.
   * @returns - The inputs serialized to a buffer.
   */
  toBuffer() {
    return serializeToBuffer(...EmptyBlockRootRollupInputs.getFields(this));
  }

  /**
   * Serializes the inputs to a hex string.
   * @returns The instance serialized to a hex string.
   */
  toString() {
    return bufferToHex(this.toBuffer());
  }

  /**
   * Creates a new instance from fields.
   * @param fields - Fields to create the instance from.
   * @returns A new instance.
   */
  static from(fields: FieldsOf<EmptyBlockRootRollupInputs>): EmptyBlockRootRollupInputs {
    return new EmptyBlockRootRollupInputs(...EmptyBlockRootRollupInputs.getFields(fields));
  }

  /**
   * Extracts fields from an instance.
   * @param fields - Fields to create the instance from.
   * @returns An array of fields.
   */
  static getFields(fields: FieldsOf<EmptyBlockRootRollupInputs>) {
    return [
      fields.archive,
      fields.blockHash,
      fields.globalVariables,
      fields.vkTreeRoot,
      fields.protocolContractTreeRoot,
      fields.proverId,
    ] as const;
  }

  /**
   * Deserializes the inputs from a buffer.
   * @param buffer - A buffer to deserialize from.
   * @returns A new RootRollupInputs instance.
   */
  static fromBuffer(buffer: Buffer | BufferReader): EmptyBlockRootRollupInputs {
    const reader = BufferReader.asReader(buffer);
    return new EmptyBlockRootRollupInputs(
      reader.readObject(AppendOnlyTreeSnapshot),
      Fr.fromBuffer(reader),
      GlobalVariables.fromBuffer(reader),
      Fr.fromBuffer(reader),
      Fr.fromBuffer(reader),
      Fr.fromBuffer(reader),
    );
  }

  /**
   * Deserializes the inputs from a hex string.
   * @param str - A hex string to deserialize from.
   * @returns A new RootRollupInputs instance.
   */
  static fromString(str: string) {
    return EmptyBlockRootRollupInputs.fromBuffer(hexToBuffer(str));
  }

  /** Returns a buffer representation for JSON serialization. */
  toJSON() {
    return this.toBuffer();
  }

  /** Creates an instance from a buffer string. */
  static get schema() {
    return bufferSchemaFor(EmptyBlockRootRollupInputs);
  }
}
