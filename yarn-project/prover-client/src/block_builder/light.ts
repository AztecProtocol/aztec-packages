import {
  type BlockBuilder,
  L2Block,
  MerkleTreeId,
  type MerkleTreeWriteOperations,
  type ProcessedTx,
  makeEmptyProcessedTx,
} from '@aztec/circuit-types';
import { Fr, type GlobalVariables, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/circuits.js';
import { padArrayEnd } from '@aztec/foundation/collection';
import { createDebugLogger } from '@aztec/foundation/log';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types';
import { protocolContractTreeRoot } from '@aztec/protocol-contracts';
import { type TelemetryClient } from '@aztec/telemetry-client';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';

import { inspect } from 'util';

import {
  buildBaseRollupHints,
  buildHeaderAndBodyFromTxs,
  getTreeSnapshot,
} from '../orchestrator/block-building-helpers.js';

/**
 * Builds a block and its header from a set of processed tx without running any circuits.
 */
export class LightweightBlockBuilder implements BlockBuilder {
  private numTxs?: number;
  private globalVariables?: GlobalVariables;
  private l1ToL2Messages?: Fr[];

  private readonly txs: ProcessedTx[] = [];

  private readonly logger = createDebugLogger('aztec:sequencer-client:block_builder_light');

  constructor(private db: MerkleTreeWriteOperations, private telemetry: TelemetryClient) {}

  async startNewBlock(numTxs: number, globalVariables: GlobalVariables, l1ToL2Messages: Fr[]): Promise<void> {
    this.logger.verbose('Starting new block', { numTxs, globalVariables: inspect(globalVariables), l1ToL2Messages });
    this.numTxs = numTxs;
    this.globalVariables = globalVariables;
    this.l1ToL2Messages = padArrayEnd(l1ToL2Messages, Fr.ZERO, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP);

    // Update L1 to L2 tree
    await this.db.appendLeaves(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, this.l1ToL2Messages!);
  }

  async addNewTx(tx: ProcessedTx): Promise<void> {
    this.logger.verbose('Adding new tx to block', { txHash: tx.hash.toString() });
    this.txs.push(tx);
    await buildBaseRollupHints(tx, this.globalVariables!, this.db);
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
          await getVKTreeRoot(),
          protocolContractTreeRoot,
        ),
      );
    }

    return this.buildBlock();
  }

  private async buildBlock(): Promise<L2Block> {
    this.logger.verbose(`Finalising block`);

    const { header, body } = await buildHeaderAndBodyFromTxs(
      this.txs,
      this.globalVariables!,
      this.l1ToL2Messages!,
      this.db,
    );

    await this.db.updateArchive(header);
    const newArchive = await getTreeSnapshot(MerkleTreeId.ARCHIVE, this.db);

    const block = new L2Block(newArchive, header, body);
    return block;
  }
}

export class LightweightBlockBuilderFactory {
  constructor(private telemetry?: TelemetryClient) {}

  create(db: MerkleTreeWriteOperations): BlockBuilder {
    return new LightweightBlockBuilder(db, this.telemetry ?? new NoopTelemetryClient());
  }
}

/**
 * Creates a block builder under the hood with the given txs and messages and creates a block.
 * Automatically adds padding txs to get to a minimum of 2 txs in the block.
 * @param db - A db fork to use for block building.
 */
export async function buildBlock(
  txs: ProcessedTx[],
  globalVariables: GlobalVariables,
  l1ToL2Messages: Fr[],
  db: MerkleTreeWriteOperations,
  telemetry: TelemetryClient = new NoopTelemetryClient(),
) {
  const builder = new LightweightBlockBuilder(db, telemetry);
  await builder.startNewBlock(Math.max(txs.length, 2), globalVariables, l1ToL2Messages);
  for (const tx of txs) {
    await builder.addNewTx(tx);
  }
  return await builder.setBlockCompleted();
}
