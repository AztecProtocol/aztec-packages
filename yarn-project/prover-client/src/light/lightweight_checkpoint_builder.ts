import { SpongeBlob, computeBlobsHashFromBlobs, getBlobsPerL1Block } from '@aztec/blob-lib';
import { NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/constants';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { L2BlockNew } from '@aztec/stdlib/block';
import { Checkpoint } from '@aztec/stdlib/checkpoint';
import type { MerkleTreeWriteOperations } from '@aztec/stdlib/interfaces/server';
import { computeCheckpointOutHash, computeInHashFromL1ToL2Messages } from '@aztec/stdlib/messaging';
import { CheckpointConstantData, CheckpointHeader } from '@aztec/stdlib/rollup';
import { AppendOnlyTreeSnapshot, MerkleTreeId } from '@aztec/stdlib/trees';
import { ContentCommitment, type GlobalVariables, type ProcessedTx, StateReference } from '@aztec/stdlib/tx';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import {
  buildHeaderAndBodyFromTxs,
  getTreeSnapshot,
  insertSideEffects,
} from '../orchestrator/block-building-helpers.js';

/**
 * Builds a checkpoint and its header and the blocks in it from a set of processed tx without running any circuits.
 *
 * It updates the l1-to-l2 message tree when starting a new checkpoint, inserts the side effects to note hash,
 * nullifier, and public data trees, then updates the archive tree when a block is added.
 */
export class LightweightCheckpointBuilder {
  private readonly logger = createLogger('lightweight-checkpoint-builder');
  private constants: CheckpointConstantData | undefined;
  private l1ToL2Messages: Fr[] = [];
  private lastArchives: AppendOnlyTreeSnapshot[] = [];
  private spongeBlob = SpongeBlob.empty();
  private blocks: L2BlockNew[] = [];
  private blobFields: Fr[] = [];

  constructor(
    private db: MerkleTreeWriteOperations,
    private telemetry: TelemetryClient = getTelemetryClient(),
  ) {}

  async startNewCheckpoint(
    constants: CheckpointConstantData,
    l1ToL2Messages: Fr[],
    totalNumBlobFields: number,
  ): Promise<void> {
    this.logger.debug('Starting new checkpoint', { constants: constants.toInspect(), l1ToL2Messages });
    this.constants = constants;

    // Insert l1-to-l2 messages into the tree.
    this.l1ToL2Messages = l1ToL2Messages;
    await this.db.appendLeaves(
      MerkleTreeId.L1_TO_L2_MESSAGE_TREE,
      padArrayEnd<Fr, number>(l1ToL2Messages, Fr.ZERO, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP),
    );

    this.lastArchives.push(await getTreeSnapshot(MerkleTreeId.ARCHIVE, this.db));
    this.spongeBlob = await SpongeBlob.init(totalNumBlobFields);
    this.blocks = [];
    this.blobFields = [new Fr(totalNumBlobFields)];
  }

  async addBlock(globalVariables: GlobalVariables, endState: StateReference, txs: ProcessedTx[]): Promise<L2BlockNew> {
    const isFirstBlock = this.blocks.length === 0;
    const lastArchive = this.lastArchives[this.lastArchives.length - 1];

    for (const tx of txs) {
      await insertSideEffects(tx, this.db);
    }

    const { header, body, blockBlobFields } = await buildHeaderAndBodyFromTxs(
      txs,
      lastArchive,
      endState,
      globalVariables,
      this.spongeBlob,
      isFirstBlock,
    );

    await this.db.updateArchive(header);
    const newArchive = await getTreeSnapshot(MerkleTreeId.ARCHIVE, this.db);
    this.lastArchives.push(newArchive);

    const block = new L2BlockNew(newArchive, header, body);
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
      throw new Error('No blocks added to checkpoint.');
    }
    if (this.blobFields.length !== this.blobFields[0].toNumber()) {
      throw new Error(
        `Blob fields length does not match. Expected ${this.blobFields[0].toNumber()}, got ${this.blobFields.length}.`,
      );
    }

    const blocks = this.blocks;

    const newArchive = this.lastArchives[this.lastArchives.length - 1];

    const blobs = getBlobsPerL1Block(this.blobFields);
    const blobsHash = computeBlobsHashFromBlobs(blobs);

    const inHash = await computeInHashFromL1ToL2Messages(this.l1ToL2Messages);

    const outHash = computeCheckpointOutHash(blocks.map(block => block.body.txEffects.map(tx => tx.l2ToL1Msgs)));

    const constants = this.constants!;

    // timestamp of a checkpoint is the timestamp of the last block in the checkpoint.
    const timestamp = blocks[blocks.length - 1].timestamp;

    const totalManaUsed = blocks.reduce((acc, block) => acc.add(block.header.totalManaUsed), Fr.ZERO);

    const header = CheckpointHeader.from({
      lastArchiveRoot: this.lastArchives[0].root,
      contentCommitment: new ContentCommitment(blobsHash, inHash, outHash),
      slotNumber: constants.slotNumber,
      timestamp,
      coinbase: constants.coinbase,
      feeRecipient: constants.feeRecipient,
      gasFees: constants.gasFees,
      totalManaUsed,
    });

    return new Checkpoint(newArchive, header, blocks);
  }
}
