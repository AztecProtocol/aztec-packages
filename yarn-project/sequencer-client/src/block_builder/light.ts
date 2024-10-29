import { createDebugLogger } from '@aztec/aztec.js';
import {
  type BlockBuilder,
  Body,
  L2Block,
  MerkleTreeId,
  type MerkleTreeWriteOperations,
  type ProcessedTx,
  type TxEffect,
  makeEmptyProcessedTx,
  toTxEffect,
} from '@aztec/circuit-types';
import { Fr, type GlobalVariables, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP, SpongeBlob } from '@aztec/circuits.js';
import { padArrayEnd } from '@aztec/foundation/collection';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types';
import { protocolContractTreeRoot } from '@aztec/protocol-contracts';
import { buildBaseRollupHints, buildHeaderFromTxEffects, getTreeSnapshot } from '@aztec/prover-client/helpers';
import { type TelemetryClient } from '@aztec/telemetry-client';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';

/**
 * Builds a block and its header from a set of processed tx without running any circuits.
 */
export class LightweightBlockBuilder implements BlockBuilder {
  private numTxs?: number;
  private spongeBlobState?: SpongeBlob;
  private globalVariables?: GlobalVariables;
  private l1ToL2Messages?: Fr[];

  private readonly txs: ProcessedTx[] = [];

  private readonly logger = createDebugLogger('aztec:sequencer-client:block_builder_light');

  constructor(private db: MerkleTreeWriteOperations, private telemetry: TelemetryClient) {}

  async startNewBlock(
    numTxs: number,
    numTxsEffects: number,
    globalVariables: GlobalVariables,
    l1ToL2Messages: Fr[],
  ): Promise<void> {
    this.logger.verbose('Starting new block', { numTxs, globalVariables, l1ToL2Messages });
    this.numTxs = numTxs;
    this.spongeBlobState = SpongeBlob.init(numTxsEffects);
    this.globalVariables = globalVariables;
    this.l1ToL2Messages = padArrayEnd(l1ToL2Messages, Fr.ZERO, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP);

    // Update L1 to L2 tree
    await this.db.appendLeaves(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, this.l1ToL2Messages!);
  }

  async addNewTx(tx: ProcessedTx): Promise<void> {
    this.logger.verbose('Adding new tx to block', { txHash: tx.hash.toString() });
    this.txs.push(tx);
    await buildBaseRollupHints(tx, this.globalVariables!, this.db, this.spongeBlobState!);
  }

  async setBlockCompleted(): Promise<L2Block> {
    const paddingTxCount = this.numTxs! - this.txs.length;
    this.logger.verbose(`Setting block as completed and adding ${paddingTxCount} padding txs`);
    for (let i = 0; i < paddingTxCount; i++) {
      await this.addNewTx(
        makeEmptyProcessedTx(
          this.db.getInitialHeader(),
          this.globalVariables!.chainId,
          this.globalVariables!.version,
          getVKTreeRoot(),
          protocolContractTreeRoot,
        ),
      );
    }

    return this.buildBlock();
  }

  private async buildBlock(): Promise<L2Block> {
    this.logger.verbose(`Finalising block`);
    const nonEmptyTxEffects: TxEffect[] = this.txs
      .map(tx => toTxEffect(tx, this.globalVariables!.gasFees))
      .filter(txEffect => !txEffect.isEmpty());
    const body = new Body(nonEmptyTxEffects);
    const header = await buildHeaderFromTxEffects(body, this.globalVariables!, this.l1ToL2Messages!, this.db);

    await this.db.updateArchive(header);
    const newArchive = await getTreeSnapshot(MerkleTreeId.ARCHIVE, this.db);

    const block = new L2Block(newArchive, header, body);
    return block;
  }

  // Reinitialises the blob state if more tx effects are required
  // See public_processor.ts for use case
  public reInitSpongeBlob(totalNumTxsEffects: number) {
    if (this.spongeBlobState!.fields > 0) {
      throw new Error(
        'Cannot reinitialise blob state after txs have been added. Ensure the correct number of tx effects has been passed to BlockProvingState constructor.',
      );
    }
    this.spongeBlobState = SpongeBlob.init(totalNumTxsEffects);
  }
}

export class LightweightBlockBuilderFactory {
  constructor(private telemetry?: TelemetryClient) {}

  create(db: MerkleTreeWriteOperations): BlockBuilder {
    return new LightweightBlockBuilder(db, this.telemetry ?? new NoopTelemetryClient());
  }
}
