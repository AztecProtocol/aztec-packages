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
import { type AztecKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb';

import { expect } from '@jest/globals';

import { SlasherClient, type SlasherConfig } from './slasher_client.js';

// Most of this test are directly copied from the P2P client test.
describe('In-Memory Slasher Client', () => {
  let blockSource: MockL2BlockSource;
  let kvStore: AztecKVStore;
  let client: SlasherClient;
  let config: SlasherConfig & L1ContractsConfig & L1ReaderConfig;

  beforeEach(() => {
    blockSource = new MockL2BlockSource();
    blockSource.createBlocks(100);

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

    kvStore = openTmpStore();
    client = new SlasherClient(config, kvStore, blockSource);
  });

  const advanceToProvenBlock = async (getProvenBlockNumber: number, provenEpochNumber = getProvenBlockNumber) => {
    blockSource.setProvenBlockNumber(getProvenBlockNumber);
    blockSource.setProvenEpochNumber(provenEpochNumber);
    await retryUntil(
      () => Promise.resolve(client.getSyncedProvenBlockNum() >= getProvenBlockNumber),
      'synced',
      10,
      0.1,
    );
  };

  afterEach(async () => {
    if (client.isReady()) {
      await client.stop();
    }
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
    await client.stop();

    const client2 = new SlasherClient(config, kvStore, blockSource);
    expect(client2.getSyncedLatestBlockNum()).toEqual(client.getSyncedLatestBlockNum());
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

      blockSource.addBlocks([L2Block.random(91), L2Block.random(92)]);

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
