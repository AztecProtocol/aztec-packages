import { Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import type { FieldsOf } from '@aztec/foundation/types';

import { AppendOnlyTreeSnapshot } from '../trees/append_only_tree_snapshot.js';
import { GlobalVariables } from '../tx/global_variables.js';

/**
 * Constants that are the same for the entire block.
 */
export class BlockConstantData {
  constructor(
    /** Archive tree snapshot at the very beginning of the entire rollup. */
    public lastArchive: AppendOnlyTreeSnapshot,
    /** L1 to L2 message tree snapshot at the very beginning of the entire rollup. */
    public lastL1ToL2: AppendOnlyTreeSnapshot,
    /** Root of the verification key tree. */
    public vkTreeRoot: Fr,
    /** Root of the protocol contract tree. */
    public protocolContractTreeRoot: Fr,
    /** Global variables for the block. */
    public globalVariables: GlobalVariables,
  ) {}

  static from(fields: FieldsOf<BlockConstantData>): BlockConstantData {
    return new BlockConstantData(...BlockConstantData.getFields(fields));
  }

  static fromBuffer(buffer: Buffer | BufferReader): BlockConstantData {
    const reader = BufferReader.asReader(buffer);
    return new BlockConstantData(
      reader.readObject(AppendOnlyTreeSnapshot),
      reader.readObject(AppendOnlyTreeSnapshot),
      Fr.fromBuffer(reader),
      Fr.fromBuffer(reader),
      reader.readObject(GlobalVariables),
    );
  }

  static getFields(fields: FieldsOf<BlockConstantData>) {
    return [
      fields.lastArchive,
      fields.lastL1ToL2,
      fields.vkTreeRoot,
      fields.protocolContractTreeRoot,
      fields.globalVariables,
    ] as const;
  }

  static empty() {
    return new BlockConstantData(
      AppendOnlyTreeSnapshot.empty(),
      AppendOnlyTreeSnapshot.empty(),
      Fr.ZERO,
      Fr.ZERO,
      GlobalVariables.empty(),
    );
  }

  toBuffer() {
    return serializeToBuffer(...BlockConstantData.getFields(this));
  }
}
