import { SpongeBlob, computeBlobsHashFromBlobs, encodeCheckpointEndMarker, getBlobsPerL1Block } from '@aztec/blob-lib';
import { type CheckpointNumber, IndexWithinCheckpoint } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import { elapsed } from '@aztec/foundation/timer';
import { L2Block } from '@aztec/stdlib/block';
import { Checkpoint } from '@aztec/stdlib/checkpoint';
import type { MerkleTreeWriteOperations } from '@aztec/stdlib/interfaces/server';
import {
  accumulateCheckpointOutHashes,
  accumulateInboxRollingHash,
  appendL1ToL2MessagesToTree,
  computeCheckpointOutHash,
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
  private readonly logger: Logger;

  private lastArchives: AppendOnlyTreeSnapshot[] = [];
  private spongeBlob: SpongeBlob;
  private blocks: L2Block[] = [];
  private blobFields: Fr[] = [];

  constructor(
    public readonly checkpointNumber: CheckpointNumber,
    public readonly constants: CheckpointGlobalVariables,
    public feeAssetPriceModifier: bigint,
    public readonly l1ToL2Messages: Fr[],
    private readonly previousCheckpointOutHashes: Fr[],
    // Inbox rolling hash of the previous checkpoint (this checkpoint's chain start); genesis is zero.
    private readonly previousInboxRollingHash: Fr,
    public readonly db: MerkleTreeWriteOperations,
    bindings?: LoggerBindings,
  ) {
    this.logger = createLogger('checkpoint-builder', {
      ...bindings,
      instanceId: `checkpoint-${checkpointNumber}`,
    });
    this.spongeBlob = SpongeBlob.init();
    this.logger.debug('Starting new checkpoint', { constants, l1ToL2Messages, feeAssetPriceModifier });
  }

  static async startNewCheckpoint(
    checkpointNumber: CheckpointNumber,
    constants: CheckpointGlobalVariables,
    l1ToL2Messages: Fr[],
    previousCheckpointOutHashes: Fr[],
    previousInboxRollingHash: Fr,
    db: MerkleTreeWriteOperations,
    bindings?: LoggerBindings,
    feeAssetPriceModifier: bigint = 0n,
    // Streaming Inbox (AZIP-22 Fast Inbox): messages are inserted per block via `addBlock`, so `l1ToL2Messages` here
    // is empty and the up-front checkpoint-wide insertion is skipped.
    insertMessagesPerBlock: boolean = false,
  ): Promise<LightweightCheckpointBuilder> {
    // Insert l1-to-l2 messages into the tree (legacy flow: the whole checkpoint's messages up front).
    if (!insertMessagesPerBlock) {
      await appendL1ToL2MessagesToTree(db, l1ToL2Messages);
    }

    return new LightweightCheckpointBuilder(
      checkpointNumber,
      constants,
      feeAssetPriceModifier,
      l1ToL2Messages,
      previousCheckpointOutHashes,
      previousInboxRollingHash,
      db,
      bindings,
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
    feeAssetPriceModifier: bigint,
    l1ToL2Messages: Fr[],
    previousCheckpointOutHashes: Fr[],
    previousInboxRollingHash: Fr,
    db: MerkleTreeWriteOperations,
    existingBlocks: L2Block[],
    bindings?: LoggerBindings,
  ): Promise<LightweightCheckpointBuilder> {
    const builder = new LightweightCheckpointBuilder(
      checkpointNumber,
      constants,
      feeAssetPriceModifier,
      l1ToL2Messages,
      previousCheckpointOutHashes,
      previousInboxRollingHash,
      db,
      bindings,
    );

    builder.logger.debug('Resuming checkpoint from existing blocks', {
      checkpointNumber,
      numExistingBlocks: existingBlocks.length,
      blockNumbers: existingBlocks.map(b => b.header.getBlockNumber()),
    });

    if (existingBlocks.length === 0) {
      throw new Error(`Cannot resume checkpoint ${checkpointNumber} with no existing blocks`);
    }

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

  /** Returns how many blocks have been added to this checkpoint so far */
  public getBlockCount() {
    return this.blocks.length;
  }

  public getBlocks() {
    return this.blocks;
  }

  /**
   * Adds a new block to the checkpoint. The tx effects must have already been inserted into the db if
   * this is called after tx processing, if that's not the case, then set `insertTxsEffects` to true.
   */
  public async addBlock(
    globalVariables: GlobalVariables,
    txs: ProcessedTx[],
    opts: { insertTxsEffects?: boolean; expectedEndState?: StateReference; l1ToL2Messages?: Fr[] } = {},
  ): Promise<{ block: L2Block; timings: Record<string, number> }> {
    const timings: Record<string, number> = {};
    const isFirstBlock = this.blocks.length === 0;

    // Empty blocks are only allowed as the first block in a checkpoint
    if (!isFirstBlock && txs.length === 0) {
      throw new Error('Cannot add empty block that is not the first block in the checkpoint.');
    }

    if (isFirstBlock) {
      const [msGetInitialArchive, initialArchive] = await elapsed(() => getTreeSnapshot(MerkleTreeId.ARCHIVE, this.db));
      this.lastArchives.push(initialArchive);
      timings.getInitialArchive = msGetInitialArchive;
    }

    const lastArchive = this.lastArchives.at(-1)!;

    if (opts.insertTxsEffects) {
      this.logger.debug(
        `Inserting side effects for ${txs.length} txs for block ${globalVariables.blockNumber} into db`,
        { txs: txs.map(tx => tx.hash.toString()) },
      );
      let msInsertSideEffects = 0;
      for (const tx of txs) {
        const [ms] = await elapsed(() => insertSideEffects(tx, this.db));
        msInsertSideEffects += ms;
      }
      timings.insertSideEffects = msInsertSideEffects;
    }

    // Streaming Inbox: insert this block's L1-to-L2 message bundle before reading the end state,
    // so the block header's L1-to-L2 tree snapshot reflects it. First-in-checkpoint bundles are padded to
    // NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP (matching the legacy per-checkpoint insertion and the world-state
    // synchronizer); non-first bundles are appended compactly. The logical (unpadded) messages are accumulated only
    // once the block is fully built (below), so a mid-build failure does not pollute the checkpoint's inHash/rolling
    // hash; the rolling hash and inHash are recomputed over them at checkpoint completion.
    if (opts.l1ToL2Messages !== undefined) {
      if (isFirstBlock) {
        await appendL1ToL2MessagesToTree(this.db, opts.l1ToL2Messages);
      } else {
        await this.db.appendLeaves(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, opts.l1ToL2Messages);
      }
    }

    const [msGetEndState, endState] = await elapsed(() => this.db.getStateReference());
    timings.getEndState = msGetEndState;

    if (opts.expectedEndState && !endState.equals(opts.expectedEndState)) {
      this.logger.error('End state after processing txs does not match expected end state', {
        globalVariables: globalVariables.toInspect(),
        expectedEndState: opts.expectedEndState.toInspect(),
        actualEndState: endState.toInspect(),
      });
      throw new Error(`End state does not match expected end state when building block ${globalVariables.blockNumber}`);
    }

    const [msBuildHeaderAndBody, { header, body, blockBlobFields }] = await elapsed(() =>
      buildHeaderAndBodyFromTxs(txs, lastArchive, endState, globalVariables, this.spongeBlob, isFirstBlock),
    );
    timings.buildHeaderAndBody = msBuildHeaderAndBody;

    header.state.validate();

    await this.db.updateArchive(header);
    const [msUpdateArchive, newArchive] = await elapsed(() => getTreeSnapshot(MerkleTreeId.ARCHIVE, this.db));
    timings.updateArchive = msUpdateArchive;
    this.lastArchives.push(newArchive);

    const expectedNextLeafIndex = Number(globalVariables.blockNumber) + 1;
    if (newArchive.nextAvailableLeafIndex !== expectedNextLeafIndex) {
      throw new Error(
        `Archive tree next leaf index mismatch after building block ${globalVariables.blockNumber} (expected ${expectedNextLeafIndex} but got ${newArchive.nextAvailableLeafIndex})`,
      );
    }

    const indexWithinCheckpoint = IndexWithinCheckpoint(this.blocks.length);
    const block = new L2Block(newArchive, header, body, this.checkpointNumber, indexWithinCheckpoint);
    this.blocks.push(block);

    // Accumulate the streaming bundle now that the block is fully built, so a mid-build throw above leaves the
    // checkpoint's message list (and thus its inHash/rolling hash) consistent with the blocks actually built.
    if (opts.l1ToL2Messages !== undefined) {
      this.l1ToL2Messages.push(...opts.l1ToL2Messages);
    }

    const [msSpongeAbsorb] = await elapsed(() => this.spongeBlob.absorb(blockBlobFields));
    timings.spongeAbsorb = msSpongeAbsorb;
    this.blobFields.push(...blockBlobFields);

    this.logger.debug(`Built block ${header.getBlockNumber()}`, {
      globalVariables: globalVariables.toInspect(),
      archiveRoot: newArchive.root.toString(),
      stateReference: header.state.toInspect(),
      blockHash: (await block.hash()).toString(),
      txs: block.body.txEffects.map(tx => tx.txHash.toString()),
    });

    return { block, timings };
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

    const blobs = await getBlobsPerL1Block(this.blobFields);
    const blobsHash = computeBlobsHashFromBlobs(blobs);

    // Legacy inHash is dead post-flip; the checkpoint header carries zero (AZIP-22 Fast Inbox). The consensus
    // rolling hash over the consumed messages is the authoritative Inbox commitment.
    const inHash = Fr.ZERO;
    const inboxRollingHash = accumulateInboxRollingHash(this.previousInboxRollingHash, this.l1ToL2Messages);

    const { slotNumber, coinbase, feeRecipient, gasFees } = this.constants;
    const checkpointOutHash = computeCheckpointOutHash(
      blocks.map(block => block.body.txEffects.map(tx => tx.l2ToL1Msgs)),
    );
    const epochOutHash = accumulateCheckpointOutHashes([...this.previousCheckpointOutHashes, checkpointOutHash]);

    // All blocks in the checkpoint have the same timestamp
    const timestamp = blocks[blocks.length - 1].timestamp;

    const totalManaUsed = blocks.reduce((acc, block) => acc.add(block.header.totalManaUsed), Fr.ZERO);
    const accumulatedFees = blocks.reduce((acc, block) => acc.add(block.header.totalFees), Fr.ZERO);

    const header = CheckpointHeader.from({
      lastArchiveRoot: this.lastArchives[0].root,
      blobsHash,
      inHash,
      inboxRollingHash,
      epochOutHash,
      blockHeadersHash,
      slotNumber,
      timestamp,
      coinbase,
      feeRecipient,
      gasFees,
      totalManaUsed,
      accumulatedFees,
    });

    this.logger.debug(`Completed checkpoint ${this.checkpointNumber}`, {
      checkpointNumber: this.checkpointNumber,
      headerHash: header.hash().toString(),
      checkpointOutHash: checkpointOutHash.toString(),
      numPreviousCheckpointOutHashes: this.previousCheckpointOutHashes.length,
      ...header.toInspect(),
    });

    return new Checkpoint(newArchive, header, blocks, this.checkpointNumber, this.feeAssetPriceModifier);
  }

  clone() {
    const clone = new LightweightCheckpointBuilder(
      this.checkpointNumber,
      this.constants,
      this.feeAssetPriceModifier,
      [...this.l1ToL2Messages],
      [...this.previousCheckpointOutHashes],
      this.previousInboxRollingHash,
      this.db,
      this.logger.getBindings(),
    );
    clone.lastArchives = [...this.lastArchives];
    clone.spongeBlob = this.spongeBlob.clone();
    clone.blocks = [...this.blocks];
    clone.blobFields = [...this.blobFields];
    return clone;
  }
}
