import { Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';

import { z } from 'zod';

import { AppendOnlyTreeSnapshot } from '../trees/append_only_tree_snapshot.js';
import { BlockHeader } from '../tx/block_header.js';
import { Body } from './body.js';
import { makeAppendOnlyTreeSnapshot, makeHeader } from './l2_block_code_to_purge.js';

/**
 * The data that makes up the rollup proof, with encoder decoder functions.
 */
export class L2Block {
  constructor(
    /** Snapshot of archive tree after the block is applied. */
    public archive: AppendOnlyTreeSnapshot,
    /** L2 block header. */
    public header: BlockHeader,
    /** L2 block body. */
    public body: Body,
    private blockHash: Fr | undefined = undefined,
  ) {}

  static get schema() {
    return z
      .object({
        archive: AppendOnlyTreeSnapshot.schema,
        header: BlockHeader.schema,
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
    const header = reader.readObject(BlockHeader);
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
    l2BlockNum: number,
    txsPerBlock = 4,
    numPublicCallsPerTx = 3,
    numPublicLogsPerCall = 1,
    inHash: Fr | undefined = undefined,
    slotNumber: number | undefined = undefined,
    maxEffects: number | undefined = undefined,
  ): Promise<L2Block> {
    const body = await Body.random(txsPerBlock, numPublicCallsPerTx, numPublicLogsPerCall, maxEffects);

    return new L2Block(
      makeAppendOnlyTreeSnapshot(l2BlockNum + 1),
      makeHeader(0, l2BlockNum, slotNumber ?? l2BlockNum, inHash),
      body,
    );
  }

  /**
   * Creates an L2 block containing empty data.
   * @returns The L2 block.
   */
  static empty(): L2Block {
    return new L2Block(AppendOnlyTreeSnapshot.empty(), BlockHeader.empty(), Body.empty());
  }

  get number(): number {
    return this.header.getBlockNumber();
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
      blockTimestamp: this.header.globalVariables.timestamp.toNumber(),
      ...logsStats,
    };
  }

  equals(other: L2Block) {
    return this.archive.equals(other.archive) && this.header.equals(other.header) && this.body.equals(other.body);
  }
}
