import { SpongeBlob, computeBlobsHashFromBlobs, encodeCheckpointEndMarker, getBlobsPerL1Block } from '@aztec/blob-lib';
import { NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/constants';
import type { CheckpointNumber } from '@aztec/foundation/branded-types';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { L2BlockNew } from '@aztec/stdlib/block';
import { Checkpoint } from '@aztec/stdlib/checkpoint';
import type { MerkleTreeWriteOperations } from '@aztec/stdlib/interfaces/server';
import { computeInHashFromL1ToL2Messages } from '@aztec/stdlib/messaging';
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
  private readonly logger = createLogger('lightweight-checkpoint-builder');

  private lastArchives: AppendOnlyTreeSnapshot[] = [];
  private spongeBlob: SpongeBlob;
  private blocks: L2BlockNew[] = [];
  private blobFields: Fr[] = [];

  constructor(
    public readonly checkpointNumber: CheckpointNumber,
    public readonly constants: CheckpointGlobalVariables,
    public readonly l1ToL2Messages: Fr[],
    public readonly db: MerkleTreeWriteOperations,
  ) {
    this.spongeBlob = SpongeBlob.init();
    this.logger.debug('Starting new checkpoint', { constants, l1ToL2Messages });
  }

  static async startNewCheckpoint(
    checkpointNumber: CheckpointNumber,
    constants: CheckpointGlobalVariables,
    l1ToL2Messages: Fr[],
    db: MerkleTreeWriteOperations,
  ): Promise<LightweightCheckpointBuilder> {
    // Insert l1-to-l2 messages into the tree.
    await db.appendLeaves(
      MerkleTreeId.L1_TO_L2_MESSAGE_TREE,
      padArrayEnd<Fr, number>(l1ToL2Messages, Fr.ZERO, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP),
    );

    return new LightweightCheckpointBuilder(checkpointNumber, constants, l1ToL2Messages, db);
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

    const indexWithinCheckpoint = this.blocks.length;
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

    // TODO(palla/mbps): Should we source this from the constants instead?
    // timestamp of a checkpoint is the timestamp of the last block in the checkpoint.
    const timestamp = blocks[blocks.length - 1].timestamp;

    const totalManaUsed = blocks.reduce((acc, block) => acc.add(block.header.totalManaUsed), Fr.ZERO);

    const header = CheckpointHeader.from({
      lastArchiveRoot: this.lastArchives[0].root,
      blobsHash,
      inHash,
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
      this.db,
    );
    clone.lastArchives = [...this.lastArchives];
    clone.spongeBlob = this.spongeBlob.clone();
    clone.blocks = [...this.blocks];
    clone.blobFields = [...this.blobFields];
    return clone;
  }
}
