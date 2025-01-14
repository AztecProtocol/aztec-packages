import { AppendOnlyTreeSnapshot, BlockHeader } from '@aztec/circuits.js';
import { sha256, sha256ToField } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';

import { z } from 'zod';

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
  static random(
    l2BlockNum: number,
    txsPerBlock = 4,
    numPublicCallsPerTx = 3,
    numPublicLogsPerCall = 1,
    inHash: Buffer | undefined = undefined,
    slotNumber: number | undefined = undefined,
  ): L2Block {
    const body = Body.random(txsPerBlock, numPublicCallsPerTx, numPublicLogsPerCall);

    return new L2Block(
      makeAppendOnlyTreeSnapshot(l2BlockNum + 1),
      makeHeader(0, txsPerBlock, l2BlockNum, slotNumber ?? l2BlockNum, inHash),
      body,
    );
  }

  /**
   * Creates an L2 block containing empty data.
   * @returns The L2 block.
   */
  static empty(): L2Block {
    return new L2Block(AppendOnlyTreeSnapshot.zero(), BlockHeader.empty(), Body.empty());
  }

  get number(): number {
    return Number(this.header.globalVariables.blockNumber.toBigInt());
  }

  /**
   * Returns the block's hash (hash of block header).
   * @returns The block's hash.
   */
  public hash(): Fr {
    return this.header.hash();
  }

  /**
   * Computes the public inputs hash for the L2 block.
   * The same output as the hash of RootRollupPublicInputs.
   * TODO(Miranda): Check where/if this is used (v diff now with epochs and blobs)
   * @returns The public input hash for the L2 block as a field element.
   */
  // TODO(#4844)
  getPublicInputsHash(): Fr {
    const preimage = [
      this.header.globalVariables,
      AppendOnlyTreeSnapshot.zero(), // this.startNoteHashTreeSnapshot / commitments,
      AppendOnlyTreeSnapshot.zero(), // this.startNullifierTreeSnapshot,
      AppendOnlyTreeSnapshot.zero(), // this.startPublicDataTreeSnapshot,
      AppendOnlyTreeSnapshot.zero(), // this.startL1ToL2MessageTreeSnapshot,
      this.header.lastArchive,
      this.header.state.partial.noteHashTree,
      this.header.state.partial.nullifierTree,
      this.header.state.partial.publicDataTree,
      this.header.state.l1ToL2MessageTree,
      this.archive,
    ];

    return sha256ToField(preimage);
  }

  /**
   * Computes the start state hash (should equal contract data before block).
   * @returns The start state hash for the L2 block.
   */
  // TODO(#4844)
  getStartStateHash() {
    const inputValue = serializeToBuffer(
      new Fr(Number(this.header.globalVariables.blockNumber.toBigInt()) - 1),
      AppendOnlyTreeSnapshot.zero(), // this.startNoteHashTreeSnapshot,
      AppendOnlyTreeSnapshot.zero(), // this.startNullifierTreeSnapshot,
      AppendOnlyTreeSnapshot.zero(), // this.startPublicDataTreeSnapshot,
      AppendOnlyTreeSnapshot.zero(), // this.startL1ToL2MessageTreeSnapshot,
      this.header.lastArchive,
    );
    return sha256(inputValue);
  }

  /**
   * Computes the end state hash (should equal contract data after block).
   * @returns The end state hash for the L2 block.
   */
  // TODO(#4844)
  getEndStateHash() {
    const inputValue = serializeToBuffer(
      this.header.globalVariables.blockNumber,
      this.header.state.partial.noteHashTree,
      this.header.state.partial.nullifierTree,
      this.header.state.partial.publicDataTree,
      this.header.state.l1ToL2MessageTree,
      this.archive,
    );
    return sha256(inputValue);
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
        (logCount, txEffect) => logCount + txEffect.contractClassLogs.getTotalLogCount(),
        0,
      ),
      contractClassLogSize: this.body.txEffects.reduce(
        (logCount, txEffect) => logCount + txEffect.contractClassLogs.getSerializedLength(),
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
}
