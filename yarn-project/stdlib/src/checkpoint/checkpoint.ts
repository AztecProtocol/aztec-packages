import { encodeCheckpointBlobDataFromBlocks } from '@aztec/blob-lib/encoding';
import { BlockNumber, CheckpointNumber, CheckpointNumberSchema } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/fields/bn254';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import type { FieldsOf } from '@aztec/foundation/types';

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
    /** Number of the checkpoint. */
    public number: CheckpointNumber,
  ) {}

  static get schema() {
    return z
      .object({
        archive: AppendOnlyTreeSnapshot.schema,
        header: CheckpointHeader.schema,
        blocks: z.array(L2BlockNew.schema),
        number: CheckpointNumberSchema,
      })
      .transform(({ archive, header, blocks, number }) => new Checkpoint(archive, header, blocks, number));
  }

  static from(fields: FieldsOf<Checkpoint>) {
    return new Checkpoint(...Checkpoint.getFields(fields));
  }

  static getFields(fields: FieldsOf<Checkpoint>) {
    return [fields.archive, fields.header, fields.blocks, fields.number] as const;
  }

  static fromBuffer(buf: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buf);
    return new Checkpoint(
      reader.readObject(AppendOnlyTreeSnapshot),
      reader.readObject(CheckpointHeader),
      reader.readVector(L2BlockNew),
      CheckpointNumber(reader.readNumber()),
    );
  }

  public toBuffer() {
    return serializeToBuffer(this.archive, this.header, this.blocks.length, this.blocks, this.number);
  }

  public toBlobFields(): Fr[] {
    const blocks = this.blocks.map((block, i) => block.toBlockBlobData(i === 0));
    return encodeCheckpointBlobDataFromBlocks(blocks);
  }

  public hash(): Fr {
    return this.header.hash();
  }

  public getState() {
    return this.blocks.at(-1)!.header.state;
  }

  static async random(
    checkpointNumber = CheckpointNumber(1),
    {
      numBlocks = 1,
      startBlockNumber = 1,
      ...options
    }: { numBlocks?: number; startBlockNumber?: number } & Partial<Parameters<typeof CheckpointHeader.random>[0]> &
      Partial<Parameters<typeof L2BlockNew.random>[1]> = {},
  ) {
    const header = CheckpointHeader.random(options);

    const blocks = await Promise.all(
      Array.from({ length: numBlocks }, (_, i) => L2BlockNew.random(BlockNumber(startBlockNumber + i), options)),
    );

    return new Checkpoint(AppendOnlyTreeSnapshot.random(), header, blocks, checkpointNumber);
  }
}
