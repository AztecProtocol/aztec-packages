import { Fr } from '@aztec/foundation/fields';
import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, type Tuple, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';
import { type FieldsOf } from '@aztec/foundation/types';

import {
  ARCHIVE_HEIGHT,
  L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH,
  NESTED_RECURSIVE_PROOF_LENGTH,
} from '../../constants.gen.js';
import { RootParityInput } from '../parity/root_parity_input.js';
import { PartialStateReference } from '../partial_state_reference.js';
import { AppendOnlyTreeSnapshot } from '../trees/append_only_tree_snapshot.js';
import { ConstantRollupData } from './constant_rollup_data.js';

/**
 * Represents inputs of the empty block root rollup circuit.
 */
export class EmptyBlockRootRollupInputs {
  constructor(
    /**
     * The original and converted roots of the L1 to L2 messages subtrees.
     */
    public readonly l1ToL2Roots: RootParityInput<typeof NESTED_RECURSIVE_PROOF_LENGTH>,
    /**
     * Sibling path of the new L1 to L2 message tree root.
     */
    public readonly newL1ToL2MessageTreeRootSiblingPath: Tuple<Fr, typeof L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH>,
    /**
     * Snapshot of the L1 to L2 message tree at the start of the rollup.
     */
    public readonly startL1ToL2MessageTreeSnapshot: AppendOnlyTreeSnapshot,
    /**
     * Sibling path of the new block tree root.
     */
    public readonly newArchiveSiblingPath: Tuple<Fr, typeof ARCHIVE_HEIGHT>,
    public readonly previousBlockHash: Fr,
    public readonly previousPartialState: PartialStateReference,
    public readonly constants: ConstantRollupData,
    // // TODO(#7346): Temporarily added prover_id while we verify block-root proofs on L1
    public readonly proverId: Fr,
    public readonly isPadding: boolean,
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
      fields.l1ToL2Roots,
      fields.newL1ToL2MessageTreeRootSiblingPath,
      fields.startL1ToL2MessageTreeSnapshot,
      fields.newArchiveSiblingPath,
      fields.previousBlockHash,
      fields.previousPartialState,
      fields.constants,
      fields.proverId,
      fields.isPadding,
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
      RootParityInput.fromBuffer(reader, NESTED_RECURSIVE_PROOF_LENGTH),
      reader.readArray(L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH, Fr),
      reader.readObject(AppendOnlyTreeSnapshot),
      reader.readArray(ARCHIVE_HEIGHT, Fr),
      Fr.fromBuffer(reader),
      reader.readObject(PartialStateReference),
      reader.readObject(ConstantRollupData),
      Fr.fromBuffer(reader),
      reader.readBoolean(),
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
