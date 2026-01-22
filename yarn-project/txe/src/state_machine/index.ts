import { type AztecNodeConfig, AztecNodeService } from '@aztec/aztec-node';
import { TestCircuitVerifier } from '@aztec/bb-prover/test';
import { createLogger } from '@aztec/foundation/log';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { AnchorBlockStore } from '@aztec/pxe/server';
import { L2Block } from '@aztec/stdlib/block';
import { Checkpoint, L1PublishedData, PublishedCheckpoint } from '@aztec/stdlib/checkpoint';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
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
  ) {}

  public static async create(db: AztecAsyncKVStore) {
    const archiver = new TXEArchiver(db);
    const synchronizer = await TXESynchronizer.create();
    const anchorBlockStore = new AnchorBlockStore(db);

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

    return new this(node, synchronizer, archiver, anchorBlockStore);
  }

  public async handleL2Block(block: L2Block) {
    // Create a checkpoint from the block - L2Block doesn't have toCheckpoint() method
    // We need to construct the Checkpoint manually
    const checkpoint = await Checkpoint.random(block.checkpointNumber, {
      numBlocks: 1,
      startBlockNumber: Number(block.number),
    });
    // Replace the random block with our actual block
    checkpoint.blocks = [block];

    const publishedCheckpoint = new PublishedCheckpoint(
      checkpoint,
      new L1PublishedData(
        BigInt(block.header.globalVariables.blockNumber),
        block.header.globalVariables.timestamp,
        block.header.globalVariables.blockNumber.toString(),
      ),
      [],
    );
    await Promise.all([
      this.synchronizer.handleL2Block(block), // L2Block doesn't need toL2Block() conversion
      this.archiver.addCheckpoints([publishedCheckpoint], undefined),
      this.anchorBlockStore.setHeader(block.header), // Use .header property directly
    ]);
  }
}
