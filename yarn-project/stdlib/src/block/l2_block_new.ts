import { type BlockBlobData, encodeBlockBlobData } from '@aztec/blob-lib/encoding';
import { BlockNumber, CheckpointNumber, CheckpointNumberSchema } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { z } from 'zod';

import { AppendOnlyTreeSnapshot } from '../trees/append_only_tree_snapshot.js';
import { BlockHeader } from '../tx/block_header.js';
import { Body } from './body.js';
import type { L2BlockInfo } from './l2_block_info.js';

/**
 * An L2 block with a header and a body.
 * TODO: Delete the existing `L2Block` class and rename this to `L2Block`.
 */
export class L2BlockNew {
  constructor(
    /** Snapshot of archive tree after the block is applied. */
    public archive: AppendOnlyTreeSnapshot,
    /** Header of the block. */
    public header: BlockHeader,
    /** L2 block body. */
    public body: Body,
    /** Number of the checkpoint that the block belongs to. */
    public checkpointNumber: CheckpointNumber,
    /** Index of the block within the checkpoint. */
    public indexWithinCheckpoint: number,
    private blockHash: Fr | undefined = undefined,
  ) {}

  get number(): BlockNumber {
    return this.header.globalVariables.blockNumber;
  }

  get timestamp(): bigint {
    return this.header.globalVariables.timestamp;
  }

  static get schema() {
    return z
      .object({
        archive: AppendOnlyTreeSnapshot.schema,
        header: BlockHeader.schema,
        body: Body.schema,
        checkpointNumber: CheckpointNumberSchema,
        indexWithinCheckpoint: z.number(),
      })
      .transform(
        ({ archive, header, body, checkpointNumber, indexWithinCheckpoint }) =>
          new L2BlockNew(archive, header, body, checkpointNumber, indexWithinCheckpoint),
      );
  }

  /**
   * Deserializes a block from a buffer
   * @returns A deserialized L2 block.
   */
  static fromBuffer(buf: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buf);
    const header = reader.readObject(BlockHeader);
    const archive = reader.readObject(AppendOnlyTreeSnapshot);
    const body = reader.readObject(Body);
    const checkpointNumber = CheckpointNumber(reader.readNumber());
    const indexWithinCheckpoint = reader.readNumber();

    return new L2BlockNew(archive, header, body, checkpointNumber, indexWithinCheckpoint);
  }

  /**
   * Serializes a block
   * @returns A serialized L2 block as a Buffer.
   */
  toBuffer() {
    return serializeToBuffer(this.header, this.archive, this.body, this.checkpointNumber, this.indexWithinCheckpoint);
  }

  /**
   * Returns the block's hash (hash of block header).
   * @returns The block's hash.
   */
  public async hash(): Promise<Fr> {
    if (this.blockHash === undefined) {
      this.blockHash = await this.header.hash();
    }
    return this.blockHash;
  }

  public toBlobFields(): Fr[] {
    const blockBlobData = this.toBlockBlobData();
    return encodeBlockBlobData(blockBlobData);
  }

  public toBlockBlobData(): BlockBlobData {
    const isFirstBlock = this.indexWithinCheckpoint === 0;
    return {
      blockEndMarker: {
        numTxs: this.body.txEffects.length,
        timestamp: this.header.globalVariables.timestamp,
        blockNumber: this.number,
      },
      blockEndStateField: {
        l1ToL2MessageNextAvailableLeafIndex: this.header.state.l1ToL2MessageTree.nextAvailableLeafIndex,
        noteHashNextAvailableLeafIndex: this.header.state.partial.noteHashTree.nextAvailableLeafIndex,
        nullifierNextAvailableLeafIndex: this.header.state.partial.nullifierTree.nextAvailableLeafIndex,
        publicDataNextAvailableLeafIndex: this.header.state.partial.publicDataTree.nextAvailableLeafIndex,
        totalManaUsed: this.header.totalManaUsed.toBigInt(),
      },
      lastArchiveRoot: this.header.lastArchive.root,
      noteHashRoot: this.header.state.partial.noteHashTree.root,
      nullifierRoot: this.header.state.partial.nullifierTree.root,
      publicDataRoot: this.header.state.partial.publicDataTree.root,
      l1ToL2MessageRoot: isFirstBlock ? this.header.state.l1ToL2MessageTree.root : undefined,
      txs: this.body.toTxBlobData(),
    };
  }

  static empty() {
    return new L2BlockNew(AppendOnlyTreeSnapshot.empty(), BlockHeader.empty(), Body.empty(), CheckpointNumber(0), 0);
  }

  /**
   * Creates an L2 block containing random data.
   * @param l2BlockNum - The number of the L2 block.
   * @param txsPerBlock - The number of transactions to include in the block.
   * @param numPublicCallsPerTx - The number of public function calls to include in each transaction.
   * @param numPublicLogsPerCall - The number of public logs per 1 public function invocation.
   * @param inHash - The hash of the L1 to L2 messages subtree which got inserted in this block.
   * @returns The L2 block.
   */
  static async random(
    blockNumber: BlockNumber,
    {
      checkpointNumber = CheckpointNumber(Number(blockNumber)),
      indexWithinCheckpoint = 0,
      txsPerBlock = 1,
      txOptions = {},
      makeTxOptions,
      ...blockHeaderOverrides
    }: {
      checkpointNumber?: CheckpointNumber;
      indexWithinCheckpoint?: number;
      txsPerBlock?: number;
      txOptions?: Partial<Parameters<typeof Body.random>[0]>;
      makeTxOptions?: (txIndex: number) => Partial<Parameters<typeof Body.random>[0]>;
    } & Partial<Parameters<typeof BlockHeader.random>[0]> = {},
  ): Promise<L2BlockNew> {
    const archive = new AppendOnlyTreeSnapshot(Fr.random(), blockNumber + 1);
    const header = BlockHeader.random({ blockNumber, ...blockHeaderOverrides });
    const body = await Body.random({ txsPerBlock, makeTxOptions, ...txOptions });
    return new L2BlockNew(archive, header, body, checkpointNumber, indexWithinCheckpoint);
  }

  /**
   * Returns stats used for logging.
   * @returns Stats on tx count, number, and log size and count.
   */
  getStats() {
    const logsStats = {
      privateLogCount: this.body.txEffects.reduce((logCount, txEffect) => logCount + txEffect.privateLogs.length, 0),
      publicLogCount: this.body.txEffects.reduce((logCount, txEffect) => logCount + txEffect.publicLogs.length, 0),
      contractClassLogCount: this.body.txEffects.reduce(
        (logCount, txEffect) => logCount + txEffect.contractClassLogs.length,
        0,
      ),
      contractClassLogSize: this.body.txEffects.reduce(
        (totalLogSize, txEffect) =>
          totalLogSize + txEffect.contractClassLogs.reduce((acc, log) => acc + log.emittedLength, 0),
        0,
      ),
    };

    return {
      txCount: this.body.txEffects.length,
      blockNumber: this.number,
      blockTimestamp: Number(this.header.globalVariables.timestamp),
      ...logsStats,
    };
  }

  toBlockInfo(): L2BlockInfo {
    return {
      blockHash: this.blockHash,
      archive: this.archive.root,
      lastArchive: this.header.lastArchive.root,
      blockNumber: this.number,
      slotNumber: this.header.getSlot(),
      txCount: this.body.txEffects.length,
      timestamp: this.header.globalVariables.timestamp,
    };
  }
}
