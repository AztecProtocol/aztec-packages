import { type AztecNodeConfig, AztecNodeService } from '@aztec/aztec-node';
import { TestCircuitVerifier } from '@aztec/bb-prover/test';
import { CheckpointNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { type AnchorBlockStore, type ContractStore, ContractSyncService, type NoteStore } from '@aztec/pxe/server';
import { L2Block } from '@aztec/stdlib/block';
import { Checkpoint, L1PublishedData, PublishedCheckpoint } from '@aztec/stdlib/checkpoint';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import { CheckpointHeader } from '@aztec/stdlib/rollup';
import { getPackageVersion } from '@aztec/stdlib/update-checker';

import { TXEArchiver } from './archiver.js';
import { DummyP2P } from './dummy_p2p_client.js';
import { TXEGlobalVariablesBuilder } from './global_variable_builder.js';
import { MockEpochCache } from './mock_epoch_cache.js';
import { TXESynchronizer } from './synchronizer.js';

const VERSION = 1;
const CHAIN_ID = 1;

export class TXEStateMachine {
  constructor(
    public node: AztecNode,
    public synchronizer: TXESynchronizer,
    public archiver: TXEArchiver,
    public anchorBlockStore: AnchorBlockStore,
    public contractSyncService: ContractSyncService,
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
      VERSION,
      CHAIN_ID,
      new TXEGlobalVariablesBuilder(),
      new MockEpochCache(),
      getPackageVersion() ?? '',
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

    return new this(node, synchronizer, archiver, anchorBlockStore, contractSyncService);
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
