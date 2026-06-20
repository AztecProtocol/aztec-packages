import { type AztecNodeConfig, AztecNodeService } from '@aztec/aztec-node';
import { TestCircuitVerifier } from '@aztec/bb-prover/test';
import { CheckpointNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { type AnchorBlockStore, type ContractStore, ContractSyncService, type NoteStore } from '@aztec/pxe/server';
import { MessageContextService } from '@aztec/pxe/simulator';
import { L2Block, type L2TipsProvider } from '@aztec/stdlib/block';
import { Checkpoint, L1PublishedData, PublishedCheckpoint } from '@aztec/stdlib/checkpoint';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import { CheckpointHeader } from '@aztec/stdlib/rollup';

import { TXEArchiver } from './archiver.js';
import { DummyP2P } from './dummy_p2p_client.js';
import { TXEFeeProvider, TXEGlobalVariablesBuilder } from './global_variable_builder.js';
import { MockEpochCache } from './mock_epoch_cache.js';
import { TXESynchronizer } from './synchronizer.js';

const VERSION = 1;
const CHAIN_ID = 1;
// Hardcoded so the bundled TXE doesn't try to read stdlib's package.json at a relative path
// that becomes invalid once bundled
const PACKAGE_VERSION = 'txe';

export class TXEStateMachine {
  constructor(
    public node: AztecNode,
    public synchronizer: TXESynchronizer,
    public archiver: TXEArchiver,
    public anchorBlockStore: AnchorBlockStore,
    public contractSyncService: ContractSyncService,
    public messageContextService: MessageContextService,
  ) {}

  public static async create(
    archiver: TXEArchiver,
    anchorBlockStore: AnchorBlockStore,
    contractStore: ContractStore,
    noteStore: NoteStore,
  ) {
    const synchronizer = await TXESynchronizer.create();
    const aztecNodeConfig = {} as AztecNodeConfig;

    const log = createLogger('txe_node');
    const node = new AztecNodeService(
      aztecNodeConfig,
      new DummyP2P(),
      archiver,
      archiver,
      archiver,
      archiver,
      synchronizer,
      undefined,
      undefined,
      undefined,
      undefined,
      async () => {},
      VERSION,
      CHAIN_ID,
      new TXEGlobalVariablesBuilder(),
      undefined,
      new TXEFeeProvider(),
      new MockEpochCache(),
      PACKAGE_VERSION,
      new TestCircuitVerifier(),
      new TestCircuitVerifier(),
      undefined,
      log,
    );

    const contractSyncService = new ContractSyncService(
      node,
      contractStore,
      noteStore,
      createLogger('txe:contract_sync'),
    );

    const messageContextService = new MessageContextService(node);

    return new this(node, synchronizer, archiver, anchorBlockStore, contractSyncService, messageContextService);
  }

  /** Returns an {@link L2TipsProvider} backed by this node's chain tips. */
  public get l2TipsProvider(): L2TipsProvider {
    const node = this.node;
    return {
      getL2Tips: () => node.getChainTips(),
    };
  }

  public async handleL2Block(block: L2Block) {
    // Create a checkpoint from the block manually.
    // TXE uses 1-block-per-checkpoint for testing simplicity, so we can use block number as checkpoint number.
    // This uses the deprecated fromBlockNumber method intentionally for the TXE testing environment.
    const checkpointNumber = CheckpointNumber.fromBlockNumber(block.number);
    const checkpoint = new Checkpoint(
      block.archive,
      CheckpointHeader.from({
        lastArchiveRoot: block.header.lastArchive.root,
        inHash: Fr.ZERO,
        blobsHash: Fr.ZERO,
        blockHeadersHash: Fr.ZERO,
        epochOutHash: Fr.ZERO,
        slotNumber: block.header.globalVariables.slotNumber,
        timestamp: block.header.globalVariables.timestamp,
        coinbase: block.header.globalVariables.coinbase,
        feeRecipient: block.header.globalVariables.feeRecipient,
        gasFees: block.header.globalVariables.gasFees,
        totalManaUsed: block.header.totalManaUsed,
        accumulatedFees: block.header.totalFees,
      }),
      [block],
      checkpointNumber,
    );

    const publishedCheckpoint = new PublishedCheckpoint(
      checkpoint,
      new L1PublishedData(
        BigInt(block.header.globalVariables.blockNumber),
        block.header.globalVariables.timestamp,
        block.header.globalVariables.blockNumber.toString(),
      ),
      [],
    );
    // Wipe contract sync cache when anchor block changes (mirrors BlockSynchronizer behavior)
    this.contractSyncService.wipe();

    await Promise.all([
      this.synchronizer.handleL2Block(block),
      this.archiver.addCheckpoints([publishedCheckpoint], undefined),
      this.anchorBlockStore.setHeader(block.header),
    ]);
  }
}
