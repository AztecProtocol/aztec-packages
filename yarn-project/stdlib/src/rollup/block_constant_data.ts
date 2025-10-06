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
    /**
     * L1-to-L2 message tree snapshot after this block lands.
     * For the first block in a checkpoint, this should be the snapshot after inserting the new l1-to-l2 message subtree
     * into the last l1-to-l2 tree snapshot in `last_archive`.
     * For subsequent blocks, this should match the snapshot of the previous block.
     */
    public l1ToL2TreeSnapshot: AppendOnlyTreeSnapshot,
    /** Root of the verification key tree. */
    public vkTreeRoot: Fr,
    /** Hash of the protocol contracts list. */
    public protocolContractsHash: Fr,
    /** Global variables for the block. */
    public globalVariables: GlobalVariables,
    /** Identifier of the prover. */
    public proverId: Fr,
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
      Fr.fromBuffer(reader),
    );
  }

  static getFields(fields: FieldsOf<BlockConstantData>) {
    return [
      fields.lastArchive,
      fields.l1ToL2TreeSnapshot,
      fields.vkTreeRoot,
      fields.protocolContractsHash,
      fields.globalVariables,
      fields.proverId,
    ] as const;
  }

  static empty() {
    return new BlockConstantData(
      AppendOnlyTreeSnapshot.empty(),
      AppendOnlyTreeSnapshot.empty(),
      Fr.ZERO,
      Fr.ZERO,
      GlobalVariables.empty(),
      Fr.ZERO,
    );
  }

  toBuffer() {
    return serializeToBuffer(...BlockConstantData.getFields(this));
  }
}
