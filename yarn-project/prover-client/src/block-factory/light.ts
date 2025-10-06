import { SpongeBlob } from '@aztec/blob-lib';
import { NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/constants';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { L2Block } from '@aztec/stdlib/block';
import type { IBlockFactory, MerkleTreeWriteOperations } from '@aztec/stdlib/interfaces/server';
import { MerkleTreeId } from '@aztec/stdlib/trees';
import type { GlobalVariables, ProcessedTx } from '@aztec/stdlib/tx';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import {
  buildHeaderAndBodyFromTxs,
  getTreeSnapshot,
  insertSideEffectsAndBuildBaseRollupHints,
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
 * function `buildBlockWithCleanDB`, which calls `insertSideEffectsAndBuildBaseRollupHints` for you.
 */
export class LightweightBlockFactory implements IBlockFactory {
  private globalVariables?: GlobalVariables;
  private l1ToL2Messages?: Fr[];
  private startSpongeBlob?: SpongeBlob;
  private txs: ProcessedTx[] | undefined;

  private readonly logger = createLogger('lightweight-block-factory');

  constructor(
    private db: MerkleTreeWriteOperations,
    private telemetry: TelemetryClient = getTelemetryClient(),
  ) {}

  async startNewBlock(
    globalVariables: GlobalVariables,
    l1ToL2Messages: Fr[],
    // Must be provided to generate the correct spongeBlobHash for the block header if there's more than one block in the checkpoint.
    startSpongeBlob?: SpongeBlob,
    // Only insert l1 to l2 messages for the first block in a checkpoint.
    isFirstBlock = true,
  ): Promise<void> {
    this.logger.debug('Starting new block', { globalVariables: globalVariables.toInspect(), l1ToL2Messages });
    this.globalVariables = globalVariables;
    this.l1ToL2Messages = isFirstBlock ? padArrayEnd(l1ToL2Messages, Fr.ZERO, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP) : [];
    this.startSpongeBlob = startSpongeBlob;
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
    const { header, body } = await buildHeaderAndBodyFromTxs(
      this.txs ?? [],
      this.globalVariables!,
      this.l1ToL2Messages!,
      this.db,
      this.startSpongeBlob,
    );

    header.state.validate();

    const blockHeader = header.toBlockHeader();
    await this.db.updateArchive(blockHeader);
    const newArchive = await getTreeSnapshot(MerkleTreeId.ARCHIVE, this.db);

    const block = new L2Block(newArchive, header, body);

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
  startSpongeBlob?: SpongeBlob,
  isFirstBlock = true,
  telemetry: TelemetryClient = getTelemetryClient(),
) {
  const lastArchive = await getTreeSnapshot(MerkleTreeId.ARCHIVE, db);
  const builder = new LightweightBlockFactory(db, telemetry);
  await builder.startNewBlock(globalVariables, l1ToL2Messages, startSpongeBlob, isFirstBlock);
  const l1ToL2MessageTree = await getTreeSnapshot(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, db);

  for (const tx of txs) {
    // startSpongeBlob and proverId are only used for constructing private inputs of the base rollup.
    // Their values don't matter here because we are not using the return private inputs to build the block.
    const proverId = Fr.ZERO;
    await insertSideEffectsAndBuildBaseRollupHints(
      tx,
      lastArchive,
      l1ToL2MessageTree,
      startSpongeBlob?.clone() ?? SpongeBlob.init(0),
      proverId,
      db,
    );
  }
  await builder.addTxs(txs);

  return await builder.setBlockCompleted();
}
