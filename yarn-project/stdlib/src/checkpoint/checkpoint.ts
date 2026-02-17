import { encodeCheckpointBlobDataFromBlocks } from '@aztec/blob-lib/encoding';
import {
  BlockNumber,
  CheckpointNumber,
  CheckpointNumberSchema,
  IndexWithinCheckpoint,
  SlotNumber,
} from '@aztec/foundation/branded-types';
import { sum } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { BufferReader, serializeSignedBigInt, serializeToBuffer } from '@aztec/foundation/serialize';
import type { FieldsOf } from '@aztec/foundation/types';

import { z } from 'zod';

import { L2Block } from '../block/l2_block.js';
import { MAX_BLOCKS_PER_CHECKPOINT } from '../deserialization/index.js';
import { computeCheckpointOutHash } from '../messaging/out_hash.js';
import { CheckpointHeader } from '../rollup/checkpoint_header.js';
import { schemas } from '../schemas/schemas.js';
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
    public blocks: L2Block[],
    /** Number of the checkpoint. */
    public number: CheckpointNumber,
    /** Fee asset price modifier in basis points (from oracle). Defaults to 0 (no change). */
    public feeAssetPriceModifier: bigint = 0n,
  ) {}

  get slot(): SlotNumber {
    return this.header.slotNumber;
  }

  static get schema() {
    return z
      .object({
        archive: AppendOnlyTreeSnapshot.schema,
        header: CheckpointHeader.schema,
        blocks: z.array(L2Block.schema),
        number: CheckpointNumberSchema,
        feeAssetPriceModifier: schemas.BigInt,
      })
      .transform(
        ({ archive, header, blocks, number, feeAssetPriceModifier }) =>
          new Checkpoint(archive, header, blocks, number, feeAssetPriceModifier),
      );
  }

  static from(fields: FieldsOfCheckpoint) {
    return new Checkpoint(...Checkpoint.getFields(fields));
  }

  static getFields(fields: FieldsOfCheckpoint) {
    return [fields.archive, fields.header, fields.blocks, fields.number, fields.feeAssetPriceModifier] as const;
  }

  static fromBuffer(buf: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buf);
    const archive = reader.readObject(AppendOnlyTreeSnapshot);
    const header = reader.readObject(CheckpointHeader);
    const blocks = reader.readVector(L2Block, MAX_BLOCKS_PER_CHECKPOINT);
    const number = CheckpointNumber(reader.readNumber());
    const feeAssetPriceModifier = reader.readInt256();
    return new Checkpoint(archive, header, blocks, number, feeAssetPriceModifier);
  }

  public toBuffer() {
    return serializeToBuffer(
      this.archive,
      this.header,
      this.blocks.length,
      this.blocks,
      this.number,
      serializeSignedBigInt(this.feeAssetPriceModifier),
    );
  }

  public toBlobFields(): Fr[] {
    const blocks = this.blocks.map(block => block.toBlockBlobData());
    return encodeCheckpointBlobDataFromBlocks(blocks);
  }

  public hash(): Fr {
    return this.header.hash();
  }

  /**
   * Returns the out hash computed from all l2-to-l1 messages in this checkpoint.
   * Note: This value is different from the out hash in the header, which is the **accumulated** out hash over all
   * checkpoints up to and including this one in the epoch.
   */
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
      feeAssetPriceModifier = 0n,
      ...options
    }: {
      numBlocks?: number;
      startBlockNumber?: number;
      previousArchive?: AppendOnlyTreeSnapshot;
      feeAssetPriceModifier?: bigint;
    } & Partial<Parameters<typeof CheckpointHeader.random>[0]> &
      Partial<Parameters<typeof L2Block.random>[1]> = {},
  ) {
    const header = CheckpointHeader.random(options);

    // Create blocks sequentially to chain archive roots properly.
    // Each block's header.lastArchive must equal the previous block's archive.
    const blocks: L2Block[] = [];
    let lastArchive = previousArchive;
    for (let i = 0; i < numBlocks; i++) {
      const block = await L2Block.random(BlockNumber(startBlockNumber + i), {
        indexWithinCheckpoint: IndexWithinCheckpoint(i),
        ...options,
        ...(lastArchive ? { lastArchive } : {}),
      });
      lastArchive = block.archive;
      blocks.push(block);
    }

    return new Checkpoint(AppendOnlyTreeSnapshot.random(), header, blocks, checkpointNumber, feeAssetPriceModifier);
  }
}
