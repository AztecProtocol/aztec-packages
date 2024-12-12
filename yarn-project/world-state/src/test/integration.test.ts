import { MockPrefilledArchiver } from '@aztec/archiver/test';
import { type L2Block, MerkleTreeId } from '@aztec/circuit-types';
import { EthAddress, type Fr } from '@aztec/circuits.js';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import { type DataStoreConfig } from '@aztec/kv-store/config';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';

import { jest } from '@jest/globals';

import { NativeWorldStateService } from '../native/native_world_state.js';
import { type WorldStateConfig } from '../synchronizer/config.js';
import { createWorldState } from '../synchronizer/factory.js';
import { ServerWorldStateSynchronizer } from '../synchronizer/server_world_state_synchronizer.js';
import { mockBlocks } from './utils.js';

jest.setTimeout(60_000);

describe('world-state integration', () => {
  let rollupAddress: EthAddress;
  let archiver: MockPrefilledArchiver;
  let db: NativeWorldStateService;
  let synchronizer: TestWorldStateSynchronizer;
  let config: WorldStateConfig & DataStoreConfig;
  let log: Logger;

  let blocks: L2Block[];
  let messages: Fr[][];

  const MAX_BLOCK_COUNT = 20;

  beforeAll(async () => {
    log = createLogger('world-state:test:integration');
    rollupAddress = EthAddress.random();
    const db = await NativeWorldStateService.tmp(rollupAddress);
    log.info(`Generating ${MAX_BLOCK_COUNT} mock blocks`);
    ({ blocks, messages } = await mockBlocks(1, MAX_BLOCK_COUNT, 1, db));
    log.info(`Generated ${blocks.length} mock blocks`);
  });

  beforeEach(async () => {
    config = {
      dataDirectory: undefined,
      dataStoreMapSizeKB: 1024 * 1024,
      l1Contracts: { rollupAddress },
      worldStateBlockCheckIntervalMS: 20,
      worldStateProvenBlocksOnly: false,
      worldStateBlockRequestBatchSize: 5,
      worldStateDbMapSizeKb: 1024 * 1024,
      worldStateBlockHistory: 0,
    };

    archiver = new MockPrefilledArchiver(blocks, messages);

    db = (await createWorldState(config)) as NativeWorldStateService;
    synchronizer = new TestWorldStateSynchronizer(db, archiver, config, new NoopTelemetryClient());
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

    const waitForFinalised = (tipFinalised?: number) => {
      if (finalized == undefined || tipFinalised == undefined) {
        return false;
      }
      return finalized > tipFinalised;
    };

    while (tips.latest.number < blockToSyncTo && sleepTime < maxTimeoutMS) {
      await sleep(100);
      sleepTime = Date.now() - startTime;
      tips = await synchronizer.getL2Tips();
    }

    while (waitForFinalised(tips.finalized.number) && sleepTime < maxTimeoutMS) {
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
    expect(tips.latest.number).toEqual(latest);
    await expectSynchedBlockHashMatches(latest);

    if (finalized !== undefined) {
      expect(tips.finalized.number).toEqual(finalized);
      await expectSynchedBlockHashMatches(finalized);
    }
  };

  describe('block syncing', () => {
    it('performs initial sync from the archiver from genesis', async () => {
      archiver.createBlocks(5);
      await synchronizer.start();
      await expectSynchedToBlock(5);
    });

    it('syncs new blocks from the archiver from genesis', async () => {
      await synchronizer.start();
      archiver.createBlocks(5);
      await awaitSync(5);
      await expectSynchedToBlock(5);
    });

    it('syncs new blocks as they are added to archiver', async () => {
      archiver.createBlocks(5);
      await synchronizer.start();

      archiver.createBlocks(3);
      await awaitSync(8);
      await expectSynchedToBlock(8);
    });

    it('syncs new blocks via multiple batches', async () => {
      archiver.createBlocks(10);
      await synchronizer.start();
      await expectSynchedToBlock(10);

      archiver.createBlocks(10);
      await awaitSync(20);
      await expectSynchedToBlock(20);
    });

    it('syncs from latest block when restarting', async () => {
      const getBlocksSpy = jest.spyOn(archiver, 'getBlocks');

      await synchronizer.start();
      archiver.createBlocks(5);
      await awaitSync(5);
      await expectSynchedToBlock(5);
      await synchronizer.stopBlockStream();

      synchronizer = new TestWorldStateSynchronizer(db, archiver, config, new NoopTelemetryClient());

      archiver.createBlocks(3);
      await synchronizer.start();
      await expectSynchedToBlock(8);

      archiver.createBlocks(4);
      await awaitSync(12);
      await expectSynchedToBlock(12);

      expect(getBlocksSpy).toHaveBeenCalledTimes(3);
      expect(getBlocksSpy).toHaveBeenCalledWith(1, 5, false);
      expect(getBlocksSpy).toHaveBeenCalledWith(6, 3, false);
      expect(getBlocksSpy).toHaveBeenCalledWith(9, 4, false);
    });

    it('syncs only proven blocks when instructed', async () => {
      synchronizer = new TestWorldStateSynchronizer(
        db,
        archiver,
        { ...config, worldStateProvenBlocksOnly: true },
        new NoopTelemetryClient(),
      );

      archiver.createBlocks(5);
      archiver.setProvenBlockNumber(3);
      await synchronizer.start();
      await expectSynchedToBlock(3);

      archiver.setProvenBlockNumber(4);
      await awaitSync(4);
      await expectSynchedToBlock(4);
    });
  });

  describe('reorgs', () => {
    it('prunes blocks upon a reorg and resyncs', async () => {
      archiver.createBlocks(5);
      await synchronizer.start();
      await expectSynchedToBlock(5);

      // Create blocks for an alternate chain forking off block 2
      const { blocks, messages } = await mockBlocks(3, 5, 1, db);
      archiver.setPrefilledBlocks(blocks, messages);

      archiver.removeBlocks(3);
      archiver.createBlocks(2);
      await sleep(2000);
      await awaitSync(4);
      await expectSynchedToBlock(4);
    });
  });

  describe('immediate sync', () => {
    beforeEach(() => {
      // Set up a synchronizer with a longer block check interval to avoid interference with immediate sync
      synchronizer = new TestWorldStateSynchronizer(
        db,
        archiver,
        { ...config, worldStateBlockCheckIntervalMS: 1000 },
        new NoopTelemetryClient(),
      );
    });

    it('syncs immediately to the latest block', async () => {
      archiver.createBlocks(5);
      await synchronizer.start();
      await expectSynchedToBlock(5);

      archiver.createBlocks(2);
      await expectSynchedToBlock(5);
      await synchronizer.syncImmediate();
      await expectSynchedToBlock(7);
    });

    it('syncs immediately to at least the target block', async () => {
      archiver.createBlocks(5);
      await synchronizer.start();
      await expectSynchedToBlock(5);

      archiver.createBlocks(2);
      await expectSynchedToBlock(5);
      await synchronizer.syncImmediate(6);
      await expectSynchedToBlock(7);
    });

    it('syncs immediately to a past block', async () => {
      archiver.createBlocks(5);
      await synchronizer.start();
      await expectSynchedToBlock(5);

      archiver.createBlocks(2);
      await expectSynchedToBlock(5);
      await synchronizer.syncImmediate(4);
      await expectSynchedToBlock(5);
    });

    it('fails to sync to unreachable block', async () => {
      archiver.createBlocks(5);
      await synchronizer.start();
      await expectSynchedToBlock(5);

      archiver.createBlocks(2);
      await expectSynchedToBlock(5);
      await expect(() => synchronizer.syncImmediate(9)).rejects.toThrow(/unable to sync/i);
    });
  });

  describe('finalized chain', () => {
    it('syncs finalized chain tip', async () => {
      archiver.createBlocks(5);
      archiver.setProvenBlockNumber(3);

      await synchronizer.start();
      await awaitSync(5, 3);
      await expectSynchedToBlock(5, 3);

      archiver.setProvenBlockNumber(4);
      await awaitSync(5, 4);
      await expectSynchedToBlock(5, 4);
    });
  });
});

class TestWorldStateSynchronizer extends ServerWorldStateSynchronizer {
  // Skip validation for the sake of this test
  protected override verifyMessagesHashToInHash(_l1ToL2Messages: Fr[], _inHash: Buffer): void {}

  // Stops the block stream but not the db so we can reuse it for another synchronizer
  public async stopBlockStream() {
    await this.blockStream?.stop();
  }
}
