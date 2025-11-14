import { Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { z } from 'zod';

import { L2BlockNew } from '../block/l2_block_new.js';
import { CheckpointHeader } from '../rollup/checkpoint_header.js';
import { AppendOnlyTreeSnapshot } from '../trees/append_only_tree_snapshot.js';

export class Checkpoint {
  constructor(
    /** Snapshot of archive tree after the checkpoint is added. */
    public archive: AppendOnlyTreeSnapshot,
    /** Header of the checkpoint. */
    public header: CheckpointHeader,
    /** L2 blocks in the checkpoint. */
    public blocks: L2BlockNew[],
  ) {}

  static get schema() {
    return z
      .object({
        archive: AppendOnlyTreeSnapshot.schema,
        header: CheckpointHeader.schema,
        blocks: z.array(L2BlockNew.schema),
      })
      .transform(({ archive, header, blocks }) => new Checkpoint(archive, header, blocks));
  }

  static fromBuffer(buf: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buf);
    const archive = reader.readObject(AppendOnlyTreeSnapshot);
    const header = reader.readObject(CheckpointHeader);
    const blocks = reader.readVector(L2BlockNew);
    return new Checkpoint(archive, header, blocks);
  }

  toBuffer() {
    return serializeToBuffer(this.archive, this.header, this.blocks.length, this.blocks);
  }

  public toBlobFields() {
    const blocksBlobFields = this.blocks.flatMap((block, i) => block.toBlobFields(i === 0));
    return [new Fr(blocksBlobFields.length + 1)].concat(blocksBlobFields);
  }
}
