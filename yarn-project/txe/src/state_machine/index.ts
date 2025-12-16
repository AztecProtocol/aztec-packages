import { type AztecNodeConfig, AztecNodeService } from '@aztec/aztec-node';
import { TestCircuitVerifier } from '@aztec/bb-prover/test';
import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { AnchorBlockDataProvider } from '@aztec/pxe/server';
import type { L2BlockNew } from '@aztec/stdlib/block';
import { Checkpoint, L1PublishedData, PublishedCheckpoint } from '@aztec/stdlib/checkpoint';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import { CheckpointHeader } from '@aztec/stdlib/rollup';
import { ContentCommitment } from '@aztec/stdlib/tx';
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
    public anchorBlockDataProvider: AnchorBlockDataProvider,
  ) {}

  public static async create(db: AztecAsyncKVStore) {
    const archiver = new TXEArchiver(db);
    const synchronizer = await TXESynchronizer.create();
    const anchorBlockDataProvider = new AnchorBlockDataProvider(db);

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

    return new this(node, synchronizer, archiver, anchorBlockDataProvider);
  }

  public async handleL2Block(block: L2BlockNew) {
    const { header, archive, checkpointNumber } = block;
    const { globalVariables, totalManaUsed, lastArchive } = header;

    // Create a CheckpointHeader from the block's header
    const checkpointHeader = new CheckpointHeader(
      lastArchive.root,
      Fr.ZERO, // blockHeadersHash - not used in TXE
      ContentCommitment.empty(), // contentCommitment - not used in TXE
      globalVariables.slotNumber,
      globalVariables.timestamp,
      globalVariables.coinbase,
      globalVariables.feeRecipient,
      globalVariables.gasFees,
      totalManaUsed,
    );

    const checkpoint = new Checkpoint(archive, checkpointHeader, [block], checkpointNumber);

    const publishedCheckpoint = new PublishedCheckpoint(
      checkpoint,
      new L1PublishedData(
        BigInt(globalVariables.blockNumber),
        globalVariables.timestamp,
        globalVariables.blockNumber.toString(),
      ),
      [],
    );

    await Promise.all([
      this.synchronizer.handleL2Block(block),
      this.archiver.addCheckpoints([publishedCheckpoint], undefined),
      this.anchorBlockDataProvider.setHeader(header),
    ]);
  }
}
