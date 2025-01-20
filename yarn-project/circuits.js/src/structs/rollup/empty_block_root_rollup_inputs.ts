import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, type Tuple, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';
import { type FieldsOf } from '@aztec/foundation/types';

import { BlockRootRollupData } from './block_root_rollup.js';
import { ConstantRollupData } from './constant_rollup_data.js';

/**
 * Represents inputs of the empty block root rollup circuit.
 */
export class EmptyBlockRootRollupInputs {
  constructor(
    public readonly data: BlockRootRollupData,
    public readonly constants: ConstantRollupData,
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
    return [fields.data, fields.constants, fields.isPadding] as const;
  }

  /**
   * Deserializes the inputs from a buffer.
   * @param buffer - A buffer to deserialize from.
   * @returns A new RootRollupInputs instance.
   */
  static fromBuffer(buffer: Buffer | BufferReader): EmptyBlockRootRollupInputs {
    const reader = BufferReader.asReader(buffer);
    return new EmptyBlockRootRollupInputs(
      reader.readObject(BlockRootRollupData),
      reader.readObject(ConstantRollupData),
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
