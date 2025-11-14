import {
  SpongeBlob,
  computeBlobsHashFromBlobs,
  getBlobsPerL1Block,
  getTotalNumBlobFieldsFromTxs,
} from '@aztec/blob-lib';
import { NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/constants';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { L2Block, L2BlockHeader } from '@aztec/stdlib/block';
import type { IBlockFactory, MerkleTreeWriteOperations } from '@aztec/stdlib/interfaces/server';
import { computeBlockOutHash, computeInHashFromL1ToL2Messages } from '@aztec/stdlib/messaging';
import { MerkleTreeId } from '@aztec/stdlib/trees';
import { ContentCommitment, type GlobalVariables, type ProcessedTx } from '@aztec/stdlib/tx';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import {
  buildHeaderAndBodyFromTxs,
  getTreeSnapshot,
  insertSideEffects,
} from '../orchestrator/block-building-helpers.js';

/**
 * Builds a block and its header from a set of processed tx without running any circuits.
 *
 * NOTE: the onus is ON THE CALLER to update the db that is passed in with the notes hashes, nullifiers, etc
 * PRIOR to calling `buildBlock`.
 *
 * Why? Because if you are, e.g. building a block in practice from TxObjects, you are using the
 * PublicProcessor which will do this for you as it processes transactions.
 *
 * If you haven't already inserted the side effects, e.g. because you are in a testing context, you can use the helper
 * function `buildBlockWithCleanDB`, which calls `insertSideEffects` for you.
 *
 * @deprecated Use LightweightCheckpointBuilder instead. This only works for one block per checkpoint.
 */
export class LightweightBlockFactory implements IBlockFactory {
  private globalVariables?: GlobalVariables;
  private l1ToL2Messages?: Fr[];
  private txs: ProcessedTx[] | undefined;

  private readonly logger = createLogger('lightweight-block-factory');

  constructor(
    private db: MerkleTreeWriteOperations,
    private telemetry: TelemetryClient = getTelemetryClient(),
  ) {}

  async startNewBlock(globalVariables: GlobalVariables, l1ToL2Messages: Fr[]): Promise<void> {
    this.logger.debug('Starting new block', { globalVariables: globalVariables.toInspect(), l1ToL2Messages });
    this.globalVariables = globalVariables;
    this.l1ToL2Messages = padArrayEnd<Fr, number>(l1ToL2Messages, Fr.ZERO, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP);
    this.txs = undefined;
    // Update L1 to L2 tree
    await this.db.appendLeaves(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, this.l1ToL2Messages!);
  }

  addTxs(txs: ProcessedTx[]): Promise<void> {
    // Most times, `addTxs` is only called once per block.
    // So avoid copies.
    if (this.txs === undefined) {
      this.txs = txs;
    } else {
      this.txs.push(...txs);
    }
    return Promise.resolve();
  }

  setBlockCompleted(): Promise<L2Block> {
    return this.buildBlock();
  }

  private async buildBlock(): Promise<L2Block> {
    const lastArchive = await getTreeSnapshot(MerkleTreeId.ARCHIVE, this.db);
    const state = await this.db.getStateReference();

    const txs = this.txs ?? [];
    const txEffects = txs.map(tx => tx.txEffect);
    const totalNumBlobFields = getTotalNumBlobFieldsFromTxs([txEffects.map(tx => tx.getTxStartMarker())]);
    const startSpongeBlob = await SpongeBlob.init(totalNumBlobFields);

    const { header, body, blockBlobFields } = await buildHeaderAndBodyFromTxs(
      txs,
      lastArchive,
      state,
      this.globalVariables!,
      startSpongeBlob,
      true,
    );

    header.state.validate();

    await this.db.updateArchive(header);
    const newArchive = await getTreeSnapshot(MerkleTreeId.ARCHIVE, this.db);

    const outHash = computeBlockOutHash(txs.map(tx => tx.txEffect.l2ToL1Msgs));
    const inHash = await computeInHashFromL1ToL2Messages(this.l1ToL2Messages!);
    const blobFields = [new Fr(totalNumBlobFields)].concat(blockBlobFields);
    const blobsHash = computeBlobsHashFromBlobs(getBlobsPerL1Block(blobFields));
    const contentCommitment = new ContentCommitment(blobsHash, inHash, outHash);
    const l2BlockHeader = L2BlockHeader.from({
      ...header,
      contentCommitment,
    });

    const block = new L2Block(newArchive, l2BlockHeader, body);

    this.logger.debug(`Built block ${block.number}`, {
      globalVariables: this.globalVariables?.toInspect(),
      archiveRoot: newArchive.root.toString(),
      stateReference: header.state.toInspect(),
      blockHash: (await block.hash()).toString(),
      txs: block.body.txEffects.map(tx => tx.txHash.toString()),
    });

    return block;
  }
}

/**
 * Inserts the processed transactions into the DB, then creates a block.
 * @param db - A db fork to use for block building which WILL BE MODIFIED.
 */
export async function buildBlockWithCleanDB(
  txs: ProcessedTx[],
  globalVariables: GlobalVariables,
  l1ToL2Messages: Fr[],
  db: MerkleTreeWriteOperations,
  telemetry: TelemetryClient = getTelemetryClient(),
) {
  const builder = new LightweightBlockFactory(db, telemetry);
  await builder.startNewBlock(globalVariables, l1ToL2Messages);

  for (const tx of txs) {
    await insertSideEffects(tx, db);
  }
  await builder.addTxs(txs);

  return await builder.setBlockCompleted();
}
