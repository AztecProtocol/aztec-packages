import { type AztecNodeConfig, AztecNodeService } from '@aztec/aztec-node';
import { TestCircuitVerifier } from '@aztec/bb-prover/test';
import { createLogger } from '@aztec/foundation/log';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { SyncDataProvider } from '@aztec/pxe/server';
import type { L2Block } from '@aztec/stdlib/block';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import { getPackageVersion } from '@aztec/stdlib/update-checker';

import { TXEArchiver } from './archiver.js';
import { DummyP2P } from './dummy_p2p_client.js';
import { TXEGlobalVariablesBuilder } from './global_variable_builder.js';
import { TXESynchronizer } from './synchronizer.js';

export class TXEStateMachine {
  constructor(
    public node: AztecNode,
    public synchronizer: TXESynchronizer,
    public archiver: TXEArchiver,
    public syncDataProvider: SyncDataProvider,
  ) {}

  public static async create(db: AztecAsyncKVStore) {
    const archiver = new TXEArchiver(db);
    const synchronizer = await TXESynchronizer.create();
    const syncDataProvider = new SyncDataProvider(db);

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
      // version and chainId should match the ones in txe oracle
      1,
      1,
      new TXEGlobalVariablesBuilder(),
      getPackageVersion() ?? '',
      new TestCircuitVerifier(),
      undefined,
      log,
    );

    return new this(node, synchronizer, archiver, syncDataProvider);
  }

  public async handleL2Block(block: L2Block) {
    await Promise.all([
      this.synchronizer.handleL2Block(block),
      this.archiver.addBlocks([
        {
          block,
          l1: {
            blockHash: block.header.globalVariables.blockNumber.toNumber().toString(),
            blockNumber: block.header.globalVariables.blockNumber.toBigInt(),
            timestamp: block.header.globalVariables.blockNumber.toBigInt(),
          },
          attestations: [],
        },
      ]),
      this.syncDataProvider.setHeader(block.header),
    ]);
  }
}
