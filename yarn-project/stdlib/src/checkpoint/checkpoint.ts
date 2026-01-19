import { encodeCheckpointBlobDataFromBlocks } from '@aztec/blob-lib/encoding';
import { BlockNumber, CheckpointNumber, CheckpointNumberSchema, SlotNumber } from '@aztec/foundation/branded-types';
import { sum } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import type { FieldsOf } from '@aztec/foundation/types';

import { z } from 'zod';

import { L2BlockNew } from '../block/l2_block_new.js';
import { MAX_BLOCKS_PER_CHECKPOINT } from '../deserialization/index.js';
import { computeCheckpointOutHash } from '../messaging/out_hash.js';
import { CheckpointHeader } from '../rollup/checkpoint_header.js';
import { AppendOnlyTreeSnapshot } from '../trees/append_only_tree_snapshot.js';
import type { CheckpointInfo } from './checkpoint_info.js';

type FieldsOfCheckpoint = Omit<FieldsOf<Checkpoint>, 'slot'>;

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

  get slot(): SlotNumber {
    return this.header.slotNumber;
  }

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

  static from(fields: FieldsOfCheckpoint) {
    return new Checkpoint(...Checkpoint.getFields(fields));
  }

  static getFields(fields: FieldsOfCheckpoint) {
    return [fields.archive, fields.header, fields.blocks, fields.number] as const;
  }

  static fromBuffer(buf: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buf);
    return new Checkpoint(
      reader.readObject(AppendOnlyTreeSnapshot),
      reader.readObject(CheckpointHeader),
      reader.readVector(L2BlockNew, MAX_BLOCKS_PER_CHECKPOINT),
      CheckpointNumber(reader.readNumber()),
    );
  }

  public toBuffer() {
    return serializeToBuffer(this.archive, this.header, this.blocks.length, this.blocks, this.number);
  }

  public toBlobFields(): Fr[] {
    const blocks = this.blocks.map(block => block.toBlockBlobData());
    return encodeCheckpointBlobDataFromBlocks(blocks);
  }

  public hash(): Fr {
    return this.header.hash();
  }

  // Returns the out hash computed from all l2-to-l1 messages in this checkpoint.
  // Note: This value is different from the out hash in the header, which is the **accumulated** out hash over all
  // checkpoints up to and including this one in the epoch.
  public getCheckpointOutHash(): Fr {
    const msgs = this.blocks.map(block => block.body.txEffects.map(txEffect => txEffect.l2ToL1Msgs));
    return computeCheckpointOutHash(msgs);
  }

  public getState() {
    return this.blocks.at(-1)!.header.state;
  }

  public toCheckpointInfo(): CheckpointInfo {
    return {
      archive: this.archive.root,
      lastArchive: this.header.lastArchiveRoot,
      slotNumber: this.header.slotNumber,
      checkpointNumber: this.number,
      timestamp: this.header.timestamp,
    };
  }

  /** Returns stats used for logging */
  public getStats() {
    const txEffects = this.blocks.flatMap(block => block.body.txEffects);

    const logsStats = {
      privateLogCount: sum(txEffects.map(tx => tx.privateLogs.length)),
      publicLogCount: sum(txEffects.map(tx => tx.publicLogs.length)),
      contractClassLogCount: sum(txEffects.map(tx => tx.contractClassLogs.length)),
      contractClassLogSize: sum(txEffects.map(tx => sum(tx.contractClassLogs.map(log => log.emittedLength)))),
    };

    return {
      txCount: txEffects.length,
      blockCount: this.blocks.length,
      slotNumber: this.header.slotNumber,
      checkpointNumber: this.number,
      timestamp: this.header.timestamp,
      ...logsStats,
    };
  }

  static async random(
    checkpointNumber = CheckpointNumber(1),
    {
      numBlocks = 1,
      startBlockNumber = 1,
      previousArchive,
      ...options
    }: {
      numBlocks?: number;
      startBlockNumber?: number;
      previousArchive?: AppendOnlyTreeSnapshot;
    } & Partial<Parameters<typeof CheckpointHeader.random>[0]> &
      Partial<Parameters<typeof L2BlockNew.random>[1]> = {},
  ) {
    const header = CheckpointHeader.random(options);

    // Create blocks sequentially to chain archive roots properly.
    // Each block's header.lastArchive must equal the previous block's archive.
    const blocks: L2BlockNew[] = [];
    let lastArchive = previousArchive;
    for (let i = 0; i < numBlocks; i++) {
      const block = await L2BlockNew.random(BlockNumber(startBlockNumber + i), {
        indexWithinCheckpoint: i,
        ...options,
        ...(lastArchive ? { lastArchive } : {}),
      });
      lastArchive = block.archive;
      blocks.push(block);
    }

    return new Checkpoint(AppendOnlyTreeSnapshot.random(), header, blocks, checkpointNumber);
  }
}
