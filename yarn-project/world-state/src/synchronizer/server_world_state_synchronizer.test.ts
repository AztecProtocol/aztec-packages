import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import { timesParallel } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { BlockHash, type EventDrivenL2BlockStream, L2Block, type L2BlockSource } from '@aztec/stdlib/block';
import type { Checkpoint } from '@aztec/stdlib/checkpoint';
import { type MerkleTreeReadOperations, WorldStateRunningState } from '@aztec/stdlib/interfaces/server';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import { mockCheckpointAndMessages } from '@aztec/stdlib/testing';
import { MerkleTreeId } from '@aztec/stdlib/trees';
import type { BlockHeader } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import type { MerkleTreeAdminDatabase, WorldStateConfig } from '../index.js';
import { type WorldStateStatusSummary, buildEmptyWorldStateStatusFull } from '../native/message.js';
import { WorldStateSynchronizerError } from './errors.js';
import { ServerWorldStateSynchronizer } from './server_world_state_synchronizer.js';

describe('ServerWorldStateSynchronizer', () => {
  jest.setTimeout(30_000);

  let log: Logger;

  let checkpoints: { checkpoint: Checkpoint; messages: Fr[] }[];

  let blockAndMessagesSource: MockProxy<L2BlockSource & L1ToL2MessageSource>;
  let merkleTreeDb: MockProxy<MerkleTreeAdminDatabase>;
  let merkleTreeRead: MockProxy<MerkleTreeReadOperations>;
  let l2BlockStream: MockProxy<EventDrivenL2BlockStream>;

  let server: TestWorldStateSynchronizer;
  let latestHandledBlockNumber: number;

  const LATEST_BLOCK_NUMBER = 5;

  beforeAll(async () => {
    log = createLogger('world-state:test:server_world_state_synchronizer');

    // Generate 10 mock checkpoints, each with 1 block and i + 2 message.
    checkpoints = await timesParallel(10, i =>
      mockCheckpointAndMessages(CheckpointNumber(i + 1), {
        startBlockNumber: BlockNumber(i + 1),
        numBlocks: 1,
        numL1ToL2Messages: i + 2,
      }),
    );
  });

  beforeEach(() => {
    blockAndMessagesSource = mock<L2BlockSource & L1ToL2MessageSource>();
    blockAndMessagesSource.getBlockNumber.mockResolvedValue(BlockNumber(LATEST_BLOCK_NUMBER));
    // Published-block replay reads the parent block's leaf count and then the messages in the range it opens, so the
    // source answers both like an archiver holding the whole mock chain.
    blockAndMessagesSource.getBlockData.mockImplementation(async query => {
      const block = allBlocks().find(b => 'number' in query && b.number === query.number);
      return block === undefined
        ? undefined
        : {
            header: block.header,
            archive: block.archive,
            blockHash: await block.hash(),
            checkpointNumber: block.checkpointNumber,
            indexWithinCheckpoint: block.indexWithinCheckpoint,
          };
    });
    blockAndMessagesSource.getL1ToL2MessagesBetweenLeafCounts.mockResolvedValue([]);

    merkleTreeRead = mock<MerkleTreeReadOperations>();
    merkleTreeRead.getInitialHeader.mockReturnValue({
      hash: () => Promise.resolve(BlockHash.random()),
    } as BlockHeader);
    merkleTreeRead.getLeafValue.mockResolvedValue(BlockHash.random());

    merkleTreeDb = mock<MerkleTreeAdminDatabase>();
    merkleTreeDb.getCommitted.mockReturnValue(merkleTreeRead);
    merkleTreeDb.handleL2BlockAndMessages.mockImplementation((l2Block: L2Block) => {
      latestHandledBlockNumber = l2Block.number;
      return Promise.resolve(buildEmptyWorldStateStatusFull());
    });
    latestHandledBlockNumber = 0;

    merkleTreeDb.getStatusSummary.mockResolvedValue({
      unfinalizedBlockNumber: BlockNumber(latestHandledBlockNumber),
      finalizedBlockNumber: BlockNumber.ZERO,
      oldestHistoricalBlock: BlockNumber.ZERO,
      treesAreSynched: true,
    } satisfies WorldStateStatusSummary);

    l2BlockStream = mock<EventDrivenL2BlockStream>();

    const config: WorldStateConfig = {
      worldStateBlockCheckIntervalMS: 100,
      worldStateDbMapSizeKb: 1024 * 1024,
      worldStateCheckpointHistory: 0,
    };

    server = new TestWorldStateSynchronizer(merkleTreeDb, blockAndMessagesSource, config, l2BlockStream);
  });

  afterEach(async () => {
    await server.stop();
  });

  const allBlocks = () => checkpoints.flatMap(c => c.checkpoint.blocks);

  const pushBlocks = async (from: number, to: number) => {
    const blocks = allBlocks().filter(b => b.number >= from && b.number <= to);
    await server.handleBlockStreamEvent({
      type: 'blocks-added',
      blocks,
    });
    server.latest.number = BlockNumber(to);
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
    blockAndMessagesSource.getBlockNumber.mockResolvedValue(BlockNumber.ZERO);

    await server.start();
    await expectServerStatus(WorldStateRunningState.RUNNING, 0);
  });

  it('cannot be started if already stopped', async () => {
    blockAndMessagesSource.getBlockNumber.mockResolvedValue(BlockNumber.ZERO);

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
    await server.syncImmediate(BlockNumber(7));

    await expectServerStatus(WorldStateRunningState.RUNNING, 8);
    expect(merkleTreeDb.handleL2BlockAndMessages).toHaveBeenCalledTimes(8);
  });

  it('sync returns immediately if block was already synced', async () => {
    void server.start();
    await pushBlocks(1, 5);

    await server.syncImmediate(BlockNumber(4));
    expect(l2BlockStream.sync).not.toHaveBeenCalled();

    await expectServerStatus(WorldStateRunningState.RUNNING, 5);
    expect(merkleTreeDb.handleL2BlockAndMessages).toHaveBeenCalledTimes(5);
  });

  it('throws if you try to sync to an unavailable block', async () => {
    void server.start();
    await pushBlocks(1, 5);

    await expect(server.syncImmediate(BlockNumber(8))).rejects.toThrow(/unable to sync/i);
  });

  it('returns early when blockHash matches at target block number', async () => {
    void server.start();
    await pushBlocks(1, 5);

    const hashFr = Fr.random();
    merkleTreeRead.getLeafValue.mockResolvedValue(hashFr);

    await server.syncImmediate(BlockNumber(4), new BlockHash(hashFr));
    expect(l2BlockStream.sync).not.toHaveBeenCalled();
  });

  it('triggers resync when blockHash mismatches at target block number', async () => {
    void server.start();
    await pushBlocks(1, 5);

    const correctHash = new BlockHash(new Fr(123n));
    // Return a hash that won't match the provided one on the first call (pre-sync)
    merkleTreeRead.getLeafValue.mockResolvedValueOnce(new Fr(42n)); // mismatch
    // Return the correct hash after sync
    merkleTreeRead.getLeafValue.mockResolvedValueOnce(new Fr(123n)); // match

    await server.syncImmediate(BlockNumber(4), correctHash);
    expect(l2BlockStream.sync).toHaveBeenCalled();
  });

  it('throws when blockHash mismatches after sync', async () => {
    void server.start();
    await pushBlocks(1, 5);

    l2BlockStream.sync.mockImplementation(() => pushBlocks(6, 8));

    // Return wrong hash both before and after sync
    merkleTreeRead.getLeafValue.mockResolvedValue(new Fr(999n));
    const expectedHash = new BlockHash(new Fr(888n));

    await expect(server.syncImmediate(BlockNumber(7), expectedHash)).rejects.toThrow(/block hash mismatch/i);
  });

  it('throws if you try to immediate sync when not running', async () => {
    await expect(server.syncImmediate(BlockNumber(3))).rejects.toThrow(/is not running/i);
  });

  it('throws if handling blocks fails', async () => {
    void server.start();
    merkleTreeDb.handleL2BlockAndMessages.mockRejectedValue(new Error('Test error'));
    await expect(pushBlocks(1, 5)).rejects.toThrow(/Test error/i);
  });

  describe('L1 to L2 message replay', () => {
    // Blocks with a strictly growing leaf count, so each one opens a non-empty range over the one before it.
    const blockLeafCounts = [3, 3, 7];

    let messagesByRange: Map<string, Fr[]>;
    let originalLeafCounts: number[];

    afterEach(() => {
      const blocks = allBlocks();
      originalLeafCounts.forEach(
        (count, i) => (blocks[i].header.state.l1ToL2MessageTree.nextAvailableLeafIndex = count),
      );
    });

    beforeEach(() => {
      const blocks = allBlocks();
      originalLeafCounts = blockLeafCounts.map(
        (_, i) => blocks[i].header.state.l1ToL2MessageTree.nextAvailableLeafIndex,
      );
      blockLeafCounts.forEach((count, i) => (blocks[i].header.state.l1ToL2MessageTree.nextAvailableLeafIndex = count));

      // Historical replay addresses canonical message indices: resolving a count as a bucket of the current
      // partition is exactly what a reorg can make impossible, so it must not happen here.
      blockAndMessagesSource.getInboxBucketByTotalMsgCount.mockImplementation(() => {
        throw new Error('Published-block replay must not resolve leaf counts as buckets');
      });
      blockAndMessagesSource.getL1ToL2MessagesBetweenBuckets.mockImplementation(() => {
        throw new Error('Published-block replay must not read messages by bucket');
      });

      messagesByRange = new Map([
        ['0-3', [new Fr(10n), new Fr(11n), new Fr(12n)]],
        ['3-7', [new Fr(13n), new Fr(14n), new Fr(15n), new Fr(16n)]],
      ]);
      blockAndMessagesSource.getL1ToL2MessagesBetweenLeafCounts.mockImplementation((start, end) => {
        const messages = messagesByRange.get(`${start}-${end}`);
        return messages === undefined
          ? Promise.reject(new Error(`Unexpected leaf count range [${start}, ${end})`))
          : Promise.resolve(messages);
      });
    });

    it('replays each block from the leaf count range it committed to', async () => {
      void server.start();
      await pushBlocks(1, 3);

      const blocks = allBlocks();
      expect(merkleTreeDb.handleL2BlockAndMessages.mock.calls).toEqual([
        [blocks[0], messagesByRange.get('0-3')],
        // The second block consumed nothing, so its range is empty and needs no query at all.
        [blocks[1], []],
        [blocks[2], messagesByRange.get('3-7')],
      ]);
      expect(blockAndMessagesSource.getL1ToL2MessagesBetweenLeafCounts.mock.calls).toEqual([
        [0n, 3n],
        [3n, 7n],
      ]);
    });

    it('applies the blocks before an unavailable range and stops there', async () => {
      void server.start();
      messagesByRange.delete('3-7');

      await expect(pushBlocks(1, 3)).rejects.toThrow(/Unexpected leaf count range \[3, 7\)/);

      // The unavailable range fails the sync instead of silently applying the block with no messages; the blocks before
      // it were fetched and applied one at a time, so the failure does not discard them.
      expect(merkleTreeDb.handleL2BlockAndMessages.mock.calls).toEqual([
        [allBlocks()[0], messagesByRange.get('0-3')],
        [allBlocks()[1], []],
      ]);

      // Once the archiver serves the range, replay resumes from the failed block, reading its parent's leaf count.
      messagesByRange.set('3-7', [new Fr(13n), new Fr(14n), new Fr(15n), new Fr(16n)]);
      await pushBlocks(3, 3);
      expect(merkleTreeDb.handleL2BlockAndMessages.mock.calls.at(-1)).toEqual([
        allBlocks()[2],
        messagesByRange.get('3-7'),
      ]);
    });

    it('fails instead of replaying a whole message history when the parent block is missing', async () => {
      void server.start();
      blockAndMessagesSource.getBlockData.mockResolvedValue(undefined);

      await expect(pushBlocks(2, 3)).rejects.toThrow(/block 1 is unavailable/);
      expect(merkleTreeDb.handleL2BlockAndMessages).not.toHaveBeenCalled();
    });
  });

  describe('getVerifiedSnapshot', () => {
    let snapshot: MockProxy<MerkleTreeReadOperations>;

    beforeEach(() => {
      snapshot = mock<MerkleTreeReadOperations>();
      merkleTreeDb.getSnapshot.mockReturnValue(snapshot);
    });

    it('returns the snapshot when the archive leaf matches the requested block hash', async () => {
      const hash = new BlockHash(new Fr(123n));
      snapshot.getLeafValue.mockResolvedValue(new Fr(123n));

      await expect(server.getVerifiedSnapshot(BlockNumber(4), hash)).resolves.toBe(snapshot);
      // The archive leaf is read from the snapshot's own view, at the block-number index.
      expect(snapshot.getLeafValue).toHaveBeenCalledWith(MerkleTreeId.ARCHIVE, 4n);
    });

    it('throws when the archive leaf does not match the requested block hash', async () => {
      snapshot.getLeafValue.mockResolvedValue(new Fr(42n));

      await expect(server.getVerifiedSnapshot(BlockNumber(4), new BlockHash(new Fr(123n)))).rejects.toThrow(
        /block hash mismatch/i,
      );
    });

    it('throws a retryable error when the archive leaf cannot be read', async () => {
      snapshot.getLeafValue.mockResolvedValue(undefined);

      const error = await server.getVerifiedSnapshot(BlockNumber(4), new BlockHash(new Fr(123n))).catch(err => err);
      expect(error).toBeInstanceOf(WorldStateSynchronizerError);
      expect(error.message).toMatch(/unable to read block hash/i);
    });

    it('throws a terminal error when the block predates the oldest historical block', async () => {
      snapshot.getLeafValue.mockResolvedValue(undefined);
      merkleTreeDb.getStatusSummary.mockResolvedValue({
        unfinalizedBlockNumber: BlockNumber(6),
        finalizedBlockNumber: BlockNumber(4),
        oldestHistoricalBlock: BlockNumber(4),
        treesAreSynched: true,
      } satisfies WorldStateStatusSummary);

      const error = await server.getVerifiedSnapshot(BlockNumber(2), new BlockHash(new Fr(123n))).catch(err => err);
      expect(error).not.toBeInstanceOf(WorldStateSynchronizerError);
      expect(error.message).toMatch(/unable to find leaf/i);
      expect(error.message).toMatch(/pruned/i);
    });

    it('verifies block 0 against the initial header hash rather than the empty archive', async () => {
      const genesisHash = new BlockHash(new Fr(777n));
      merkleTreeRead.getInitialHeader.mockReturnValue({ hash: () => Promise.resolve(genesisHash) } as BlockHeader);

      await expect(server.getVerifiedSnapshot(BlockNumber.ZERO, genesisHash)).resolves.toBe(snapshot);
      expect(snapshot.getLeafValue).not.toHaveBeenCalled();
    });
  });
});

class TestWorldStateSynchronizer extends ServerWorldStateSynchronizer {
  public latest = { number: BlockNumber.ZERO, hash: BlockHash.random().toString() };
  public finalized = { number: BlockNumber.ZERO, hash: BlockHash.random().toString() };
  public proven = { number: BlockNumber.ZERO, hash: BlockHash.random().toString() };

  constructor(
    merkleTrees: MerkleTreeAdminDatabase,
    blockAndMessagesSource: L2BlockSource & L1ToL2MessageSource,
    worldStateConfig: WorldStateConfig,
    private mockBlockStream: EventDrivenL2BlockStream,
  ) {
    super(merkleTrees, blockAndMessagesSource, worldStateConfig);
  }

  protected override createBlockStream(): EventDrivenL2BlockStream {
    return this.mockBlockStream;
  }

  public override getL2Tips() {
    return Promise.resolve({
      proposed: this.latest,
      proven: { block: this.proven },
      finalized: { block: this.finalized },
    });
  }
}
