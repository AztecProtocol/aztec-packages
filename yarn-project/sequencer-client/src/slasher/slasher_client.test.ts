import { MockL2BlockSource } from '@aztec/archiver/test';
import { L2Block } from '@aztec/circuit-types';
import {
  type L1ContractAddresses,
  type L1ContractsConfig,
  type L1ReaderConfig,
  getL1ContractsConfigEnvVars,
} from '@aztec/ethereum';
import { EthAddress } from '@aztec/foundation/eth-address';
import { retryUntil } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import { type AztecAsyncKVStore } from '@aztec/kv-store';
import { openStoreAt, openTmpStore } from '@aztec/kv-store/lmdb-v2';

import { expect } from '@jest/globals';
import { rm } from 'fs/promises';

import { SlasherClient, type SlasherConfig } from './slasher_client.js';

// Most of this test are directly copied from the P2P client test.
describe('In-Memory Slasher Client', () => {
  let blockSource: MockL2BlockSource;
  let kvStore: AztecAsyncKVStore;
  let client: SlasherClient;
  let config: SlasherConfig & L1ContractsConfig & L1ReaderConfig;
  let tmpDir: string;

  beforeEach(async () => {
    blockSource = new MockL2BlockSource();
    await blockSource.createBlocks(100);

    const l1Config = getL1ContractsConfigEnvVars();

    // Need some configuration here. Can be a basic bitch config really.
    config = {
      ...l1Config,
      blockCheckIntervalMS: 100,
      blockRequestBatchSize: 20,
      l1Contracts: {
        slashFactoryAddress: EthAddress.ZERO,
      } as unknown as L1ContractAddresses,
      l1RpcUrl: 'http://127.0.0.1:8545',
      l1ChainId: 1,
      viemPollingIntervalMS: 1000,
    };

    // ephemeral false so that we can close and re-open during tests
    const store = await openTmpStore('test', false);
    kvStore = store;
    tmpDir = store.dataDirectory;
    client = new SlasherClient(config, kvStore, blockSource);
  });

  const advanceToProvenBlock = async (getProvenBlockNumber: number, provenEpochNumber = getProvenBlockNumber) => {
    blockSource.setProvenBlockNumber(getProvenBlockNumber);
    blockSource.setProvenEpochNumber(provenEpochNumber);
    await retryUntil(async () => (await client.getSyncedProvenBlockNum()) >= getProvenBlockNumber, 'synced', 10, 0.1);
  };

  afterEach(async () => {
    if (client.isReady()) {
      await client.stop();
    }

    await rm(tmpDir, { recursive: true, force: true, maxRetries: 3 });
  });

  it('can start & stop', async () => {
    expect(client.isReady()).toEqual(false);

    await client.start();
    expect(client.isReady()).toEqual(true);

    await client.stop();
    expect(client.isReady()).toEqual(false);
  });

  it('restores the previous block number it was at', async () => {
    await client.start();
    const synchedBlock = await client.getSyncedLatestBlockNum();
    await client.stop();

    const reopenedStore = await openStoreAt(tmpDir);
    const client2 = new SlasherClient(config, reopenedStore, blockSource);
    expect(await client2.getSyncedLatestBlockNum()).toEqual(synchedBlock);
    await client2.stop();
  });

  describe('Chain prunes', () => {
    it('moves the tips on a chain reorg', async () => {
      blockSource.setProvenBlockNumber(0);
      await client.start();

      await advanceToProvenBlock(90);

      await expect(client.getL2Tips()).resolves.toEqual({
        latest: { number: 100, hash: expect.any(String) },
        proven: { number: 90, hash: expect.any(String) },
        finalized: { number: 90, hash: expect.any(String) },
      });

      blockSource.removeBlocks(10);

      // give the client a chance to react to the reorg
      await sleep(100);

      await expect(client.getL2Tips()).resolves.toEqual({
        latest: { number: 90, hash: expect.any(String) },
        proven: { number: 90, hash: expect.any(String) },
        finalized: { number: 90, hash: expect.any(String) },
      });

      blockSource.addBlocks([await L2Block.random(91), await L2Block.random(92)]);

      // give the client a chance to react to the new blocks
      await sleep(100);

      await expect(client.getL2Tips()).resolves.toEqual({
        latest: { number: 92, hash: expect.any(String) },
        proven: { number: 90, hash: expect.any(String) },
        finalized: { number: 90, hash: expect.any(String) },
      });
    });
  });
});
