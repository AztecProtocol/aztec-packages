import { type BlockBlobData, encodeBlockBlobData, encodeCheckpointBlobDataFromBlocks } from '@aztec/blob-lib/encoding';
import { BlockNumber, CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';

import { z } from 'zod';

import { Checkpoint } from '../checkpoint/checkpoint.js';
import { AppendOnlyTreeSnapshot } from '../trees/append_only_tree_snapshot.js';
import type { BlockHeader } from '../tx/block_header.js';
import { Body } from './body.js';
import { makeAppendOnlyTreeSnapshot, makeL2BlockHeader } from './l2_block_code_to_purge.js';
import { L2BlockHeader } from './l2_block_header.js';
import type { L2BlockInfo } from './l2_block_info.js';
import { L2BlockNew } from './l2_block_new.js';

/**
 * The data that makes up the rollup proof, with encoder decoder functions.
 *
 * @deprecated Use `L2BlockNew` instead.
 */
export class L2Block {
  constructor(
    /** Snapshot of archive tree after the block is applied. */
    public archive: AppendOnlyTreeSnapshot,
    /** L2 block header. */
    public header: L2BlockHeader,
    /** L2 block body. */
    public body: Body,
    private blockHash: Fr | undefined = undefined,
  ) {}

  static get schema() {
    return z
      .object({
        archive: AppendOnlyTreeSnapshot.schema,
        header: L2BlockHeader.schema,
        body: Body.schema,
      })
      .transform(({ archive, header, body }) => new L2Block(archive, header, body));
  }

  /**
   * Deserializes a block from a buffer
   * @returns A deserialized L2 block.
   */
  static fromBuffer(buf: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buf);
    const header = reader.readObject(L2BlockHeader);
    const archive = reader.readObject(AppendOnlyTreeSnapshot);
    const body = reader.readObject(Body);

    return new L2Block(archive, header, body);
  }

  /**
   * Serializes a block
   * @returns A serialized L2 block as a Buffer.
   */
  toBuffer() {
    return serializeToBuffer(this.header, this.archive, this.body);
  }

  /**
   * Deserializes L2 block from a buffer.
   * @param str - A serialized L2 block.
   * @returns Deserialized L2 block.
   */
  static fromString(str: string): L2Block {
    return L2Block.fromBuffer(hexToBuffer(str));
  }

  /**
   * Serializes a block to a string.
   * @returns A serialized L2 block as a string.
   */
  toString(): string {
    return bufferToHex(this.toBuffer());
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
    l2BlockNum: BlockNumber,
    txsPerBlock = 4,
    numPublicCallsPerTx = 3,
    numPublicLogsPerCall = 1,
    inHash: Fr | undefined = undefined,
    slotNumber: number | undefined = undefined,
    maxEffects: number | undefined = undefined,
  ): Promise<L2Block> {
    const body = await Body.random({ txsPerBlock, numPublicCallsPerTx, numPublicLogsPerCall, maxEffects });

    return new L2Block(
      makeAppendOnlyTreeSnapshot(l2BlockNum + 1),
      makeL2BlockHeader(0, l2BlockNum, slotNumber ?? l2BlockNum, { inHash }),
      body,
    );
  }

  /**
   * Creates an L2 block containing empty data.
   * @returns The L2 block.
   */
  static empty(): L2Block {
    return new L2Block(AppendOnlyTreeSnapshot.empty(), L2BlockHeader.empty(), Body.empty());
  }

  get number(): BlockNumber {
    return this.header.getBlockNumber();
  }

  get slot(): SlotNumber {
    return this.header.getSlot();
  }

  get timestamp(): bigint {
    return this.header.globalVariables.timestamp;
  }

  /**
   * Returns the block's hash (hash of block header).
   * @returns The block's hash.
   */
  public async hash(): Promise<Fr> {
    if (this.blockHash === undefined) {
      this.blockHash = await this.getBlockHeader().hash();
    }
    return this.blockHash;
  }

  /**
   * @deprecated
   * This only works when there's one block per checkpoint.
   * TODO(#17027): Remove this method from L2Block and create a dedicated Checkpoint class.
   */
  public getCheckpointHeader() {
    return this.header.toCheckpointHeader();
  }

  // Temporary helper to get the actual block header.
  public getBlockHeader(): BlockHeader {
    return this.header.toBlockHeader();
  }

  public toL2Block(args: { checkpointNumber?: CheckpointNumber; indexWithinCheckpoint?: number } = {}): L2BlockNew {
    return new L2BlockNew(
      this.archive,
      this.getBlockHeader(),
      this.body,
      args?.checkpointNumber ?? CheckpointNumber.fromBlockNumber(this.number),
      args?.indexWithinCheckpoint ?? 0,
    );
  }

  public toCheckpoint() {
    return new Checkpoint(
      this.archive,
      this.getCheckpointHeader(),
      [this.toL2Block()],
      CheckpointNumber.fromBlockNumber(this.number),
    );
  }

  static fromCheckpoint(checkpoint: Checkpoint) {
    const checkpointHeader = checkpoint.header;
    const block = checkpoint.blocks.at(-1)!;
    const header = new L2BlockHeader(
      new AppendOnlyTreeSnapshot(checkpointHeader.lastArchiveRoot, block.number),
      checkpointHeader.blobsHash,
      checkpointHeader.inHash,
      block.header.state,
      block.header.globalVariables,
      block.header.totalFees,
      checkpointHeader.totalManaUsed,
      block.header.spongeBlobHash,
      checkpointHeader.blockHeadersHash,
    );
    return new L2Block(checkpoint.archive, header, block.body);
  }

  /**
   * @deprecated
   * This only works when there's one block per checkpoint.
   * TODO(#17027): Remove this method from L2Block and create a dedicated Checkpoint class.
   */
  public getCheckpointBlobFields() {
    const blockBlobData = this.toBlockBlobData();
    return encodeCheckpointBlobDataFromBlocks([blockBlobData]);
  }

  public toBlobFields(): Fr[] {
    const blockBlobData = this.toBlockBlobData();
    return encodeBlockBlobData(blockBlobData);
  }

  public toBlockBlobData(): BlockBlobData {
    // There's only one L2Block per checkpoint, so it's always the first block in the checkpoint.
    const isFirstBlock = true;
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

  equals(other: L2Block) {
    return this.archive.equals(other.archive) && this.header.equals(other.header) && this.body.equals(other.body);
  }
}
