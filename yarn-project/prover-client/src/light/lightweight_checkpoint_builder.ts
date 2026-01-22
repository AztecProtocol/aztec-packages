import { SpongeBlob, computeBlobsHashFromBlobs, encodeCheckpointEndMarker, getBlobsPerL1Block } from '@aztec/blob-lib';
import { NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/constants';
import { type CheckpointNumber, IndexWithinCheckpoint } from '@aztec/foundation/branded-types';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { Logger } from '@aztec/foundation/log';
import { L2BlockNew } from '@aztec/stdlib/block';
import { Checkpoint } from '@aztec/stdlib/checkpoint';
import type { MerkleTreeWriteOperations } from '@aztec/stdlib/interfaces/server';
import {
  accumulateCheckpointOutHashes,
  computeCheckpointOutHash,
  computeInHashFromL1ToL2Messages,
} from '@aztec/stdlib/messaging';
import { CheckpointHeader, computeBlockHeadersHash } from '@aztec/stdlib/rollup';
import { AppendOnlyTreeSnapshot, MerkleTreeId } from '@aztec/stdlib/trees';
import {
  type CheckpointGlobalVariables,
  type GlobalVariables,
  type ProcessedTx,
  StateReference,
} from '@aztec/stdlib/tx';

import {
  buildHeaderAndBodyFromTxs,
  getTreeSnapshot,
  insertSideEffects,
} from '../orchestrator/block-building-helpers.js';

/**
 * Builds a checkpoint and its header and the blocks in it from a set of processed tx without running any circuits.
 *
 * It updates the l1-to-l2 message tree when starting a new checkpoint, and then updates the archive tree when each block is added.
 * Finally completes the checkpoint by computing its header.
 */
export class LightweightCheckpointBuilder {
  private lastArchives: AppendOnlyTreeSnapshot[] = [];
  private spongeBlob: SpongeBlob;
  private blocks: L2BlockNew[] = [];
  private blobFields: Fr[] = [];

  constructor(
    public readonly checkpointNumber: CheckpointNumber,
    public readonly constants: CheckpointGlobalVariables,
    public readonly l1ToL2Messages: Fr[],
    private readonly previousCheckpointOutHashes: Fr[],
    public readonly db: MerkleTreeWriteOperations,
    private readonly logger: Logger,
  ) {
    this.spongeBlob = SpongeBlob.init();
    this.logger.debug('Starting new checkpoint', { constants, l1ToL2Messages });
  }

  static async startNewCheckpoint(
    checkpointNumber: CheckpointNumber,
    constants: CheckpointGlobalVariables,
    l1ToL2Messages: Fr[],
    previousCheckpointOutHashes: Fr[],
    db: MerkleTreeWriteOperations,
    logger: Logger,
  ): Promise<LightweightCheckpointBuilder> {
    // Insert l1-to-l2 messages into the tree.
    await db.appendLeaves(
      MerkleTreeId.L1_TO_L2_MESSAGE_TREE,
      padArrayEnd<Fr, number>(l1ToL2Messages, Fr.ZERO, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP),
    );

    return new LightweightCheckpointBuilder(
      checkpointNumber,
      constants,
      l1ToL2Messages,
      previousCheckpointOutHashes,
      db,
      logger,
    );
  }

  /**
   * Resumes building a checkpoint from existing blocks. This is used for validator re-execution
   * where blocks have already been built and their effects are already in the database.
   * Unlike startNewCheckpoint, this does NOT append l1ToL2Messages to the tree since they
   * were already added when the blocks were originally built.
   */
  static async resumeCheckpoint(
    checkpointNumber: CheckpointNumber,
    constants: CheckpointGlobalVariables,
    l1ToL2Messages: Fr[],
    previousCheckpointOutHashes: Fr[],
    db: MerkleTreeWriteOperations,
    existingBlocks: L2BlockNew[],
    logger: Logger,
  ): Promise<LightweightCheckpointBuilder> {
    const builder = new LightweightCheckpointBuilder(
      checkpointNumber,
      constants,
      l1ToL2Messages,
      previousCheckpointOutHashes,
      db,
      logger,
    );

    builder.logger.debug('Resuming checkpoint from existing blocks', {
      checkpointNumber,
      numExistingBlocks: existingBlocks.length,
      blockNumbers: existingBlocks.map(b => b.header.getBlockNumber()),
    });

    // Validate block order and consistency
    for (let i = 1; i < existingBlocks.length; i++) {
      const prev = existingBlocks[i - 1];
      const curr = existingBlocks[i];
      if (curr.number !== prev.number + 1) {
        throw new Error(`Non-sequential block numbers in resumeCheckpoint: ${prev.number} -> ${curr.number}`);
      }
      if (!prev.archive.root.equals(curr.header.lastArchive.root)) {
        throw new Error(`Archive root mismatch between blocks ${prev.number} and ${curr.number}`);
      }
    }

    for (let i = 0; i < existingBlocks.length; i++) {
      const block = existingBlocks[i];
      const isFirstBlock = i === 0;

      if (isFirstBlock) {
        builder.lastArchives.push(block.header.lastArchive);
      }

      builder.lastArchives.push(block.archive);

      const blockBlobFields = block.toBlobFields();
      await builder.spongeBlob.absorb(blockBlobFields);
      builder.blobFields.push(...blockBlobFields);

      builder.blocks.push(block);
    }

    return builder;
  }

  /**
   * Adds a new block to the checkpoint. The tx effects must have already been inserted into the db if
   * this is called after tx processing, if that's not the case, then set `insertTxsEffects` to true.
   */
  public async addBlock(
    globalVariables: GlobalVariables,
    txs: ProcessedTx[],
    opts: { insertTxsEffects?: boolean; expectedEndState?: StateReference } = {},
  ): Promise<L2BlockNew> {
    const isFirstBlock = this.blocks.length === 0;

    // Empty blocks are only allowed as the first block in a checkpoint
    if (!isFirstBlock && txs.length === 0) {
      throw new Error('Cannot add empty block that is not the first block in the checkpoint.');
    }

    if (isFirstBlock) {
      this.lastArchives.push(await getTreeSnapshot(MerkleTreeId.ARCHIVE, this.db));
    }

    const lastArchive = this.lastArchives.at(-1)!;

    if (opts.insertTxsEffects) {
      this.logger.debug(
        `Inserting side effects for ${txs.length} txs for block ${globalVariables.blockNumber} into db`,
        { txs: txs.map(tx => tx.hash.toString()) },
      );
      for (const tx of txs) {
        await insertSideEffects(tx, this.db);
      }
    }

    const endState = await this.db.getStateReference();
    if (opts.expectedEndState && !endState.equals(opts.expectedEndState)) {
      this.logger.error('End state after processing txs does not match expected end state', {
        globalVariables: globalVariables.toInspect(),
        expectedEndState: opts.expectedEndState.toInspect(),
        actualEndState: endState.toInspect(),
      });
      throw new Error(`End state does not match expected end state when building block ${globalVariables.blockNumber}`);
    }

    const { header, body, blockBlobFields } = await buildHeaderAndBodyFromTxs(
      txs,
      lastArchive,
      endState,
      globalVariables,
      this.spongeBlob,
      isFirstBlock,
    );

    header.state.validate();

    await this.db.updateArchive(header);
    const newArchive = await getTreeSnapshot(MerkleTreeId.ARCHIVE, this.db);
    this.lastArchives.push(newArchive);

    const indexWithinCheckpoint = IndexWithinCheckpoint(this.blocks.length);
    const block = new L2BlockNew(newArchive, header, body, this.checkpointNumber, indexWithinCheckpoint);
    this.blocks.push(block);

    await this.spongeBlob.absorb(blockBlobFields);
    this.blobFields.push(...blockBlobFields);

    this.logger.debug(`Built block ${header.getBlockNumber()}`, {
      globalVariables: globalVariables.toInspect(),
      archiveRoot: newArchive.root.toString(),
      stateReference: header.state.toInspect(),
      blockHash: (await block.hash()).toString(),
      txs: block.body.txEffects.map(tx => tx.txHash.toString()),
    });

    return block;
  }

  async completeCheckpoint(): Promise<Checkpoint> {
    if (!this.blocks.length) {
      throw new Error('Cannot complete a checkpoint with no blocks');
    }

    const numBlobFields = this.blobFields.length + 1; // +1 for the checkpoint end marker.
    const checkpointEndMarker = encodeCheckpointEndMarker({ numBlobFields });
    this.blobFields.push(checkpointEndMarker);

    const blocks = this.blocks;
    const blockHeadersHash = await computeBlockHeadersHash(blocks.map(block => block.header));

    const newArchive = this.lastArchives[this.lastArchives.length - 1];

    const blobs = getBlobsPerL1Block(this.blobFields);
    const blobsHash = computeBlobsHashFromBlobs(blobs);

    const inHash = computeInHashFromL1ToL2Messages(this.l1ToL2Messages);

    const { slotNumber, coinbase, feeRecipient, gasFees } = this.constants;
    const checkpointOutHash = computeCheckpointOutHash(
      blocks.map(block => block.body.txEffects.map(tx => tx.l2ToL1Msgs)),
    );
    const epochOutHash = accumulateCheckpointOutHashes([...this.previousCheckpointOutHashes, checkpointOutHash]);

    // TODO(palla/mbps): Should we source this from the constants instead?
    // timestamp of a checkpoint is the timestamp of the last block in the checkpoint.
    const timestamp = blocks[blocks.length - 1].timestamp;

    const totalManaUsed = blocks.reduce((acc, block) => acc.add(block.header.totalManaUsed), Fr.ZERO);

    const header = CheckpointHeader.from({
      lastArchiveRoot: this.lastArchives[0].root,
      blobsHash,
      inHash,
      epochOutHash,
      blockHeadersHash,
      slotNumber,
      timestamp,
      coinbase,
      feeRecipient,
      gasFees,
      totalManaUsed,
    });

    return new Checkpoint(newArchive, header, blocks, this.checkpointNumber);
  }

  clone() {
    const clone = new LightweightCheckpointBuilder(
      this.checkpointNumber,
      this.constants,
      [...this.l1ToL2Messages],
      [...this.previousCheckpointOutHashes],
      this.db,
      this.logger,
    );
    clone.lastArchives = [...this.lastArchives];
    clone.spongeBlob = this.spongeBlob.clone();
    clone.blocks = [...this.blocks];
    clone.blobFields = [...this.blobFields];
    return clone;
  }
}
