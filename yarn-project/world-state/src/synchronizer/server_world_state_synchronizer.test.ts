import {
  type L1ToL2MessageSource,
  L2Block,
  type L2BlockSource,
  type L2BlockStream,
  type MerkleTreeReadOperations,
  WorldStateRunningState,
} from '@aztec/circuit-types';
import { Fr, MerkleTreeCalculator } from '@aztec/circuits.js';
import { L1_TO_L2_MSG_SUBTREE_HEIGHT } from '@aztec/circuits.js/constants';
import { times, timesParallel } from '@aztec/foundation/collection';
import { randomInt } from '@aztec/foundation/crypto';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { SHA256Trunc } from '@aztec/merkle-tree';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import { type MerkleTreeAdminDatabase, type WorldStateConfig } from '../index.js';
import { buildEmptyWorldStateStatusFull } from '../native/message.js';
import { ServerWorldStateSynchronizer } from './server_world_state_synchronizer.js';

describe('ServerWorldStateSynchronizer', () => {
  jest.setTimeout(30_000);

  let log: Logger;

  let l1ToL2Messages: Fr[];
  let inHash: Buffer;

  let blockAndMessagesSource: MockProxy<L2BlockSource & L1ToL2MessageSource>;
  let merkleTreeDb: MockProxy<MerkleTreeAdminDatabase>;
  let merkleTreeRead: MockProxy<MerkleTreeReadOperations>;
  let l2BlockStream: MockProxy<L2BlockStream>;

  let server: TestWorldStateSynchronizer;
  let latestHandledBlockNumber: number;

  const LATEST_BLOCK_NUMBER = 5;

  beforeAll(() => {
    log = createLogger('world-state:test:server_world_state_synchronizer');

    // Seed l1 to l2 msgs
    l1ToL2Messages = times(randomInt(2 ** L1_TO_L2_MSG_SUBTREE_HEIGHT), Fr.random);

    // Compute inHash for verification
    inHash = new MerkleTreeCalculator(
      L1_TO_L2_MSG_SUBTREE_HEIGHT,
      Buffer.alloc(32),
      new SHA256Trunc().hash,
    ).computeTreeRoot(l1ToL2Messages.map(msg => msg.toBuffer()));
  });

  beforeEach(() => {
    blockAndMessagesSource = mock<L2BlockSource & L1ToL2MessageSource>();
    blockAndMessagesSource.getBlockNumber.mockResolvedValue(LATEST_BLOCK_NUMBER);
    blockAndMessagesSource.getL1ToL2Messages.mockResolvedValue(l1ToL2Messages);

    merkleTreeRead = mock<MerkleTreeReadOperations>();

    merkleTreeDb = mock<MerkleTreeAdminDatabase>();
    merkleTreeDb.getCommitted.mockReturnValue(merkleTreeRead);
    merkleTreeDb.handleL2BlockAndMessages.mockImplementation((l2Block: L2Block) => {
      latestHandledBlockNumber = l2Block.number;
      return Promise.resolve(buildEmptyWorldStateStatusFull());
    });
    latestHandledBlockNumber = 0;

    l2BlockStream = mock<L2BlockStream>();

    // Note that worldStateProvenBlocksOnly is the only config value that is used by the synchronizer itself
    // Others are relayed to the blockstream, which is mocked in this test suite
    const config: WorldStateConfig = {
      worldStateBlockCheckIntervalMS: 100,
      worldStateProvenBlocksOnly: false,
      worldStateDbMapSizeKb: 1024 * 1024,
      worldStateBlockHistory: 0,
    };

    server = new TestWorldStateSynchronizer(merkleTreeDb, blockAndMessagesSource, config, l2BlockStream);
  });

  afterEach(async () => {
    await server.stop();
  });

  const pushBlocks = async (from: number, to: number) => {
    await server.handleBlockStreamEvent({
      type: 'blocks-added',
      blocks: await timesParallel(to - from + 1, i => L2Block.random(i + from, 4, 3, 1, inHash)),
    });
    server.latest.number = to;
  };

  const expectServerStatus = async (state: WorldStateRunningState, blockNumber: number) => {
    await expect(server.status()).resolves.toEqual(expect.objectContaining({ state }));
    expect(latestHandledBlockNumber).toEqual(blockNumber);
  };

  it('updates sync progress', async () => {
    // test initial state
    await expectServerStatus(WorldStateRunningState.IDLE, 0);

    // start the sync process but don't await
    let syncFinished = false;
    server
      .start()
      .then(() => (syncFinished = true))
      .catch(err => log.error('Sync not completed: ', err));

    // push a bunch of blocks
    await pushBlocks(1, 3);
    await expectServerStatus(WorldStateRunningState.SYNCHING, 3);
    expect(syncFinished).toBeFalsy();

    // and push the remaining ones
    await pushBlocks(4, 5);
    await expectServerStatus(WorldStateRunningState.RUNNING, 5);
    expect(syncFinished).toBeTruthy();

    // stop the synchronizer
    await server.stop();

    // and check the final status
    await expectServerStatus(WorldStateRunningState.STOPPED, 5);
    expect(merkleTreeDb.handleL2BlockAndMessages).toHaveBeenCalledTimes(5);
  });

  it('handles multiple calls to start', async () => {
    // start the sync and push 5 blocks
    void server.start();
    await pushBlocks(1, 5);

    // starting the sync again should not trigger more operations
    await server.start();
    await server.start();

    await expectServerStatus(WorldStateRunningState.RUNNING, 5);
    expect(merkleTreeDb.handleL2BlockAndMessages).toHaveBeenCalledTimes(5);
  });

  it('immediately syncs if no new blocks', async () => {
    blockAndMessagesSource.getBlockNumber.mockResolvedValue(0);

    await server.start();
    await expectServerStatus(WorldStateRunningState.RUNNING, 0);
  });

  it('cannot be started if already stopped', async () => {
    blockAndMessagesSource.getBlockNumber.mockResolvedValue(0);

    await server.start();
    await server.stop();

    await expect(server.start()).rejects.toThrow();
  });

  it('can immediately sync to latest', async () => {
    void server.start();
    await pushBlocks(1, 5);

    l2BlockStream.sync.mockImplementation(() => pushBlocks(6, 7));
    await server.syncImmediate();

    await expectServerStatus(WorldStateRunningState.RUNNING, 7);
    expect(merkleTreeDb.handleL2BlockAndMessages).toHaveBeenCalledTimes(7);
  });

  it('can immediately sync to a minimum block number', async () => {
    void server.start();
    await pushBlocks(1, 5);

    l2BlockStream.sync.mockImplementation(() => pushBlocks(6, 8));
    await server.syncImmediate(7);

    await expectServerStatus(WorldStateRunningState.RUNNING, 8);
    expect(merkleTreeDb.handleL2BlockAndMessages).toHaveBeenCalledTimes(8);
  });

  it('sync returns immediately if block was already synced', async () => {
    void server.start();
    await pushBlocks(1, 5);

    await server.syncImmediate(4);
    expect(l2BlockStream.sync).not.toHaveBeenCalled();

    await expectServerStatus(WorldStateRunningState.RUNNING, 5);
    expect(merkleTreeDb.handleL2BlockAndMessages).toHaveBeenCalledTimes(5);
  });

  it('throws if you try to sync to an unavailable block', async () => {
    void server.start();
    await pushBlocks(1, 5);

    await expect(server.syncImmediate(8)).rejects.toThrow(/unable to sync/i);
  });

  it('throws if you try to immediate sync when not running', async () => {
    await expect(server.syncImmediate(3)).rejects.toThrow(/is not running/i);
  });
});

class TestWorldStateSynchronizer extends ServerWorldStateSynchronizer {
  public latest = { number: 0, hash: '' };
  public finalized = { number: 0, hash: '' };
  public proven = { number: 0, hash: '' };

  constructor(
    merkleTrees: MerkleTreeAdminDatabase,
    blockAndMessagesSource: L2BlockSource & L1ToL2MessageSource,
    worldStateConfig: WorldStateConfig,
    private mockBlockStream: L2BlockStream,
  ) {
    super(merkleTrees, blockAndMessagesSource, worldStateConfig);
  }

  protected override createBlockStream(): L2BlockStream {
    return this.mockBlockStream;
  }

  public override getL2Tips() {
    return Promise.resolve({ latest: this.latest, proven: this.proven, finalized: this.finalized });
  }
}
