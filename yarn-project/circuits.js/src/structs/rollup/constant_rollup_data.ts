import { Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { type FieldsOf } from '@aztec/foundation/types';

import { GlobalVariables } from '../global_variables.js';
import { AppendOnlyTreeSnapshot } from '../trees/append_only_tree_snapshot.js';

/**
 * Data which is forwarded through the base rollup circuits unchanged.
 */
export class ConstantRollupData {
  constructor(
    /** Archive tree snapshot at the very beginning of the entire rollup. */
    public lastArchive: AppendOnlyTreeSnapshot,
    /**
     * Root of the verification key tree.
     */
    public vkTreeRoot: Fr,
    /**
     * Root of the protocol contract tree.
     */
    public protocolContractTreeRoot: Fr,
    /**
     * Global variables for the block
     */
    public globalVariables: GlobalVariables,
  ) {}

  static from(fields: FieldsOf<ConstantRollupData>): ConstantRollupData {
    return new ConstantRollupData(...ConstantRollupData.getFields(fields));
  }

  static fromBuffer(buffer: Buffer | BufferReader): ConstantRollupData {
    const reader = BufferReader.asReader(buffer);
    return new ConstantRollupData(
      reader.readObject(AppendOnlyTreeSnapshot),
      Fr.fromBuffer(reader),
      Fr.fromBuffer(reader),
      reader.readObject(GlobalVariables),
    );
  }

  static getFields(fields: FieldsOf<ConstantRollupData>) {
    return [fields.lastArchive, fields.vkTreeRoot, fields.protocolContractTreeRoot, fields.globalVariables] as const;
  }

  static empty() {
    return new ConstantRollupData(AppendOnlyTreeSnapshot.zero(), Fr.ZERO, Fr.ZERO, GlobalVariables.empty());
  }

  toBuffer() {
    return serializeToBuffer(...ConstantRollupData.getFields(this));
  }
}
