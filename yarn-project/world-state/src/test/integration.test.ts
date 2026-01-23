import { MockPrefilledArchiver } from '@aztec/archiver/test';
import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import { timesAsync } from '@aztec/foundation/collection';
import type { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import type { DataStoreConfig } from '@aztec/kv-store/config';
import type { Checkpoint } from '@aztec/stdlib/checkpoint';
import { MerkleTreeId } from '@aztec/stdlib/trees';

import { describe, jest } from '@jest/globals';

import { NativeWorldStateService } from '../native/native_world_state.js';
import type { WorldStateConfig } from '../synchronizer/config.js';
import { createWorldState } from '../synchronizer/factory.js';
import { ServerWorldStateSynchronizer } from '../synchronizer/server_world_state_synchronizer.js';
import { mockCheckpoint } from './utils.js';

jest.setTimeout(60_000);

describe('world-state integration', () => {
  let rollupAddress: EthAddress;
  let archiver: MockPrefilledArchiver;
  let db: NativeWorldStateService;
  let synchronizer: TestWorldStateSynchronizer;
  let config: WorldStateConfig & DataStoreConfig;
  let log: Logger;

  let checkpoints: { checkpoint: Checkpoint; messages: Fr[] }[];

  const MAX_CHECKPOINT_COUNT = 20;

  beforeAll(async () => {
    log = createLogger('world-state:test:integration');
    rollupAddress = EthAddress.random();
    const db = await NativeWorldStateService.tmp(rollupAddress);
    const fork = await db.fork(BlockNumber(0));
    log.info(`Generating ${MAX_CHECKPOINT_COUNT} mock checkpoints`);
    checkpoints = await timesAsync(MAX_CHECKPOINT_COUNT, i =>
      mockCheckpoint(CheckpointNumber(i + 1), fork, { startBlockNumber: BlockNumber(i + 1) }),
    );
    log.info(`Generated ${checkpoints.length} mock checkpoints`);
    await fork.close();
  });

  beforeEach(async () => {
    config = {
      dataDirectory: undefined,
      dataStoreMapSizeKb: 1024 * 1024,
      l1Contracts: { rollupAddress },
      worldStateBlockCheckIntervalMS: 20,
      worldStateBlockRequestBatchSize: 5,
      worldStateDbMapSizeKb: 1024 * 1024,
      worldStateBlockHistory: 0,
    };

    archiver = new MockPrefilledArchiver(checkpoints);

    db = (await createWorldState(config)) as NativeWorldStateService;
    synchronizer = new TestWorldStateSynchronizer(db, archiver, config);
    log.info(`Created synchronizer`);
  }, 30_000);

  afterEach(async () => {
    await synchronizer.stop();
    await db.close();
  });

  const awaitSync = async (blockToSyncTo: number, finalized?: number, maxTimeoutMS = 30000) => {
    const startTime = Date.now();
    let sleepTime = 0;
    let tips = await synchronizer.getL2Tips();

    const waitForFinalized = (tipFinalized?: number) => {
      if (finalized == undefined || tipFinalized == undefined) {
        return false;
      }
      return finalized > tipFinalized;
    };

    while (tips.proposed.number < blockToSyncTo && sleepTime < maxTimeoutMS) {
      await sleep(100);
      sleepTime = Date.now() - startTime;
      tips = await synchronizer.getL2Tips();
    }

    while (waitForFinalized(tips.finalized.block.number) && sleepTime < maxTimeoutMS) {
      await sleep(100);
      sleepTime = Date.now() - startTime;
      tips = await synchronizer.getL2Tips();
    }
  };

  const expectSynchedBlockHashMatches = async (number: number) => {
    const syncedBlockHash = await db.getCommitted().getLeafValue(MerkleTreeId.ARCHIVE, BigInt(number));
    const archiverBlockHash = await archiver.getBlockHeader(number).then(h => h?.hash());
    expect(syncedBlockHash).toEqual(archiverBlockHash);
  };

  const expectSynchedToBlock = async (latest: number, finalized?: number) => {
    const tips = await synchronizer.getL2Tips();
    expect(tips.proposed.number).toEqual(latest);
    await expectSynchedBlockHashMatches(latest);

    if (finalized !== undefined) {
      expect(tips.finalized.block.number).toEqual(finalized);
      await expectSynchedBlockHashMatches(finalized);
    }
  };

  describe('block syncing', () => {
    it('performs initial sync from the archiver from genesis', async () => {
      await archiver.createBlocks(5);
      await synchronizer.start();
      await expectSynchedToBlock(5);
    });

    it('syncs new blocks from the archiver from genesis', async () => {
      await synchronizer.start();
      await archiver.createBlocks(5);
      await awaitSync(5);
      await expectSynchedToBlock(5);
    });

    it('syncs new blocks as they are added to archiver', async () => {
      await archiver.createBlocks(5);
      await synchronizer.start();

      await archiver.createBlocks(3);
      await awaitSync(8);
      await expectSynchedToBlock(8);
    });

    it('syncs new blocks via multiple batches', async () => {
      await archiver.createBlocks(10);
      await synchronizer.start();
      await expectSynchedToBlock(10);

      await archiver.createBlocks(10);
      await awaitSync(20);
      await expectSynchedToBlock(20);
    });

    it('syncs from latest block when restarting', async () => {
      const getBlocksSpy = jest.spyOn(archiver, 'getBlocks');

      await synchronizer.start();
      await archiver.createBlocks(5);
      await awaitSync(5);
      await expectSynchedToBlock(5);
      await synchronizer.stopBlockStream();

      synchronizer = new TestWorldStateSynchronizer(db, archiver, config);

      await archiver.createBlocks(3);
      await synchronizer.start();
      await expectSynchedToBlock(8);

      await archiver.createBlocks(4);
      await awaitSync(12);
      await expectSynchedToBlock(12);

      expect(getBlocksSpy).toHaveBeenCalledWith(1, 5);
      expect(getBlocksSpy).toHaveBeenCalledWith(6, 3);
      expect(getBlocksSpy).toHaveBeenCalledWith(9, 4);
    });
  });

  describe('reorgs', () => {
    it('prunes blocks upon a reorg and resyncs', async () => {
      await archiver.createBlocks(5);
      await synchronizer.start();
      await expectSynchedToBlock(5);

      // Create checkpoints for an alternate chain forking off checkpoint 2
      const fork = await db.fork(BlockNumber(2));
      const newCheckpoints = await timesAsync(5, i =>
        mockCheckpoint(CheckpointNumber(i + 3), fork, { startBlockNumber: BlockNumber(i + 3) }),
      );
      await fork.close();
      archiver.setPrefilled(newCheckpoints);

      archiver.removeBlocks(3);
      await archiver.createBlocks(2);
      await sleep(2000);
      await awaitSync(4);
      await expectSynchedToBlock(4);
    });
  });

  describe('immediate sync', () => {
    beforeEach(() => {
      // Set up a synchronizer with a longer block check interval to avoid interference with immediate sync
      synchronizer = new TestWorldStateSynchronizer(db, archiver, { ...config, worldStateBlockCheckIntervalMS: 1000 });
    });

    it('syncs immediately to the latest block', async () => {
      await archiver.createBlocks(5);
      await synchronizer.start();
      await expectSynchedToBlock(5);

      await archiver.createBlocks(2);
      await expectSynchedToBlock(5);
      await synchronizer.syncImmediate();
      await expectSynchedToBlock(7);
    });

    it('syncs immediately to at least the target block', async () => {
      await archiver.createBlocks(5);
      await synchronizer.start();
      await expectSynchedToBlock(5);

      await archiver.createBlocks(2);
      await expectSynchedToBlock(5);
      await synchronizer.syncImmediate(BlockNumber(6));
      await expectSynchedToBlock(7);
    });

    it('syncs immediately to a past block', async () => {
      await archiver.createBlocks(5);
      await synchronizer.start();
      await expectSynchedToBlock(5);

      await archiver.createBlocks(2);
      await expectSynchedToBlock(5);
      await synchronizer.syncImmediate(BlockNumber(4));
      await expectSynchedToBlock(5);
    });

    it('fails to sync to unreachable block', async () => {
      await archiver.createBlocks(5);
      await synchronizer.start();
      await expectSynchedToBlock(5);

      await archiver.createBlocks(2);
      await expectSynchedToBlock(5);
      await expect(() => synchronizer.syncImmediate(BlockNumber(9))).rejects.toThrow(/unable to sync/i);
    });
  });

  describe('finalized chain', () => {
    it('syncs finalized chain tip', async () => {
      await archiver.createBlocks(5);
      archiver.setFinalizedBlockNumber(3);

      await synchronizer.start();
      await awaitSync(5, 3);
      await expectSynchedToBlock(5, 3);

      archiver.setFinalizedBlockNumber(4);
      await awaitSync(5, 4);
      await expectSynchedToBlock(5, 4);
    });
  });
});

class TestWorldStateSynchronizer extends ServerWorldStateSynchronizer {
  // Stops the block stream but not the db so we can reuse it for another synchronizer
  public async stopBlockStream() {
    await this.blockStream?.stop();
  }
}
