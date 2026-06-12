import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import { compactArray } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { Logger } from '@aztec/foundation/log';

import { type MockProxy, mock } from 'jest-mock-extended';
import times from 'lodash.times';

import type { BlockHeader } from '../../tx/block_header.js';
import type { BlockData } from '../block_data.js';
import { BlockHash } from '../block_hash.js';
import type { L2Block } from '../l2_block.js';
import type { BlocksQuery, L2BlockId, L2BlockSource, LocalL2Tips } from '../l2_block_source.js';
import type {
  L2BlockStreamEvent,
  L2BlockStreamEventHandler,
  L2BlockStreamLocalDataProvider,
  LocalChainTips,
} from './interfaces.js';
import { L2BlockStream } from './l2_block_stream.js';
import { L2TipsMemoryStore } from './l2_tips_memory_store.js';

describe('L2BlockStream', () => {
  let blockSource: MockProxy<L2BlockSource>;

  let latest: number = 0;

  const makeHash = (number: number) => new Fr(number).toString();

  // `hash` is a shared function reference (not a per-call closure) so two makeBlock(n) objects compare equal under
  // toEqual; called as a method it hashes `this.number`. The completion check in downloadBlocks calls it.
  const makeBlock = (number: number) =>
    ({
      number: BlockNumber(number),
      checkpointNumber: CheckpointNumber(number),
      indexWithinCheckpoint: 0,
      hash: blockHashFromNumber,
    }) as unknown as L2Block;

  const makeBlockData = (number: number, checkpointNum: number): BlockData =>
    ({
      header: makeHeader(number),
      checkpointNumber: CheckpointNumber(checkpointNum),
      indexWithinCheckpoint: 0,
    }) as unknown as BlockData;

  const makeHeader = (number: number) =>
    ({ hash: () => Promise.resolve(new BlockHash(new Fr(number))) }) as BlockHeader;

  const makeBlockId = (number: number): L2BlockId => ({ number: BlockNumber(number), hash: makeHash(number) });

  const makeCheckpointId = (number: number) => ({ number: CheckpointNumber(number), hash: makeHash(number) });

  const makeTipId = (number: number) => ({
    block: { number: BlockNumber(number), hash: makeHash(number) },
    checkpoint: { number: CheckpointNumber(number), hash: makeHash(number) },
  });

  /** A thin chain-checkpointed event for the source's checkpointed tip at `number`. */
  const checkpointedEvent = (number: number): L2BlockStreamEvent => ({
    type: 'chain-checkpointed',
    block: makeBlockId(number),
    checkpoint: makeCheckpointId(number),
  });

  /** Sets the remote tips. All tips default to 0 except latest. */
  const setRemoteTips = (latest_: number, checkpointed_?: number, proven?: number, finalized?: number) => {
    checkpointed_ = checkpointed_ ?? 0;
    proven = proven ?? 0;
    finalized = finalized ?? 0;
    latest = latest_;

    blockSource.getL2Tips.mockResolvedValue({
      proposed: { number: BlockNumber(latest), hash: makeHash(latest) },
      checkpointed: makeTipId(checkpointed_),
      proven: makeTipId(proven),
      finalized: makeTipId(finalized),
    });
  };

  beforeEach(() => {
    blockSource = mock<L2BlockSource>();

    // Returns blocks up until what was reported as the latest block.
    blockSource.getBlocks.mockImplementation((query: BlocksQuery) =>
      'from' in query
        ? Promise.resolve(
            compactArray(times(query.limit, i => (query.from + i > latest ? undefined : makeBlock(query.from + i)))),
          )
        : Promise.resolve([]),
    );

    // Returns block data for any known block that has not been pruned.
    blockSource.getBlockData.mockImplementation(query => {
      if (!('number' in query)) {
        return Promise.resolve(undefined);
      }
      return Promise.resolve(query.number > latest ? undefined : makeBlockData(query.number, query.number));
    });
  });

  describe('with mock local data provider', () => {
    let localData: TestL2BlockStreamLocalDataProvider;
    let handler: TestL2BlockStreamEventHandler;
    let blockStream: TestL2BlockStream;

    beforeEach(() => {
      localData = new TestL2BlockStreamLocalDataProvider();
      handler = new TestL2BlockStreamEventHandler();
      blockStream = new TestL2BlockStream(blockSource, localData, handler, undefined, { batchSize: 10 });
    });

    it('pulls new blocks from start', async () => {
      setRemoteTips(5);

      await blockStream.work();
      expect(handler.events).toEqual([
        { type: 'blocks-added', blocks: times(5, i => makeBlock(i + 1)) },
      ] satisfies L2BlockStreamEvent[]);
    });

    it('pulls new blocks from offset', async () => {
      setRemoteTips(15);
      localData.proposed.number = BlockNumber(10);

      await blockStream.work();
      expect(blockSource.getBlocks).toHaveBeenCalledWith({ from: BlockNumber(11), limit: 5 });
      expect(handler.events).toEqual([
        { type: 'blocks-added', blocks: times(5, i => makeBlock(i + 11)) },
      ] satisfies L2BlockStreamEvent[]);
    });

    it('pulls new blocks in multiple batches', async () => {
      setRemoteTips(45);

      await blockStream.work();
      expect(blockSource.getBlocks).toHaveBeenCalledTimes(5);
      expect(handler.callCount).toEqual(5);
      expect(handler.events).toEqual([
        { type: 'blocks-added', blocks: times(10, i => makeBlock(i + 1)) },
        { type: 'blocks-added', blocks: times(10, i => makeBlock(i + 11)) },
        { type: 'blocks-added', blocks: times(10, i => makeBlock(i + 21)) },
        { type: 'blocks-added', blocks: times(10, i => makeBlock(i + 31)) },
        { type: 'blocks-added', blocks: times(5, i => makeBlock(i + 41)) },
      ] satisfies L2BlockStreamEvent[]);
    });

    it('halts pulling blocks if stopped', async () => {
      setRemoteTips(45);
      blockStream.running = false;

      await blockStream.work();
      expect(blockSource.getBlocks).toHaveBeenCalledTimes(1);
      expect(handler.events).toEqual([
        { type: 'blocks-added', blocks: times(10, i => makeBlock(i + 1)) },
      ] satisfies L2BlockStreamEvent[]);
    });

    it('halts on handler error and retries', async () => {
      setRemoteTips(45);

      handler.throwing = true;
      await blockStream.work();
      expect(handler.callCount).toEqual(1);

      handler.throwing = false;
      await blockStream.work();
      expect(handler.callCount).toEqual(6);
      expect(handler.events).toHaveLength(5);
    });

    it('handles a reorg and requests blocks from new tip', async () => {
      setRemoteTips(45);
      localData.proposed.number = BlockNumber(40);

      for (const i of [37, 38, 39, 40]) {
        // Mess up the block hashes for a bunch of blocks
        localData.blockHashes[i] = `0xaa${i.toString()}`;
      }

      await blockStream.work();
      expect(handler.events).toEqual([
        { type: 'chain-pruned', block: makeBlockId(36), checkpointed: makeTipId(0), proven: makeTipId(0) },
        { type: 'blocks-added', blocks: times(9, i => makeBlock(i + 37)) },
      ] satisfies L2BlockStreamEvent[]);
    });

    it('emits events for chain proven and finalized', async () => {
      setRemoteTips(45, 0, 40, 35);
      localData.proposed.number = BlockNumber(40);
      localData.proven.block.number = BlockNumber(10);
      localData.finalized.block.number = BlockNumber(10);

      await blockStream.work();
      expect(handler.events).toEqual([
        { type: 'blocks-added', blocks: times(5, i => makeBlock(i + 41)) },
        { type: 'chain-proven', block: makeBlockId(40), checkpoint: makeCheckpointId(40) },
        { type: 'chain-finalized', block: makeBlockId(35), checkpoint: makeCheckpointId(35) },
      ] satisfies L2BlockStreamEvent[]);
    });

    it('emits a single chain-checkpointed event carrying the source checkpointed tip', async () => {
      // All blocks are checkpointed (checkpointed=5, proposed=5). Download all 5 blocks in one batch, then a
      // single thin checkpointed event for the source tip.
      setRemoteTips(5, 5);

      await blockStream.work();

      expect(handler.events).toEqual([
        { type: 'blocks-added', blocks: times(5, i => makeBlock(i + 1)) },
        checkpointedEvent(5),
      ]);
      // No checkpoint payloads are fetched anymore.
      expect(blockSource.getBlocks).toHaveBeenCalledWith({ from: BlockNumber(1), limit: 5 });
    });

    it('emits checkpointed once even when the checkpointed tip trails the proposed tip', async () => {
      // Blocks 1-3 checkpointed, blocks 4-5 uncheckpointed.
      setRemoteTips(5, 3);

      await blockStream.work();

      // Download all 5 blocks, then a single checkpointed event for checkpoint 3.
      expect(handler.events).toEqual([
        { type: 'blocks-added', blocks: times(5, i => makeBlock(i + 1)) },
        checkpointedEvent(3),
      ]);
    });

    it('does not re-emit the checkpointed event once the local tip matches the source', async () => {
      setRemoteTips(5, 5);
      localData.setProposed(5);
      localData.setCheckpointed(5, 5);

      await blockStream.work();
      expect(handler.events.filter(e => e.type === 'chain-checkpointed')).toEqual([]);
    });

    it('handles reorg with uncheckpointed reason when pruned to checkpointed tip', async () => {
      // Source: checkpointed=3, proposed=5
      setRemoteTips(5, 3);
      localData.proposed.number = BlockNumber(5);
      localData.checkpointed.block.number = BlockNumber(3);

      // Mess up hashes for blocks 4 and 5 (uncheckpointed blocks)
      localData.blockHashes[4] = `0xaa4`;
      localData.blockHashes[5] = `0xaa5`;

      await blockStream.work();

      // Prune to block 3 (checkpointed tip)
      expect(handler.events[0]).toEqual({
        type: 'chain-pruned',
        block: makeBlockId(3),
        checkpointed: makeTipId(3),
        proven: makeTipId(0),
      });
    });

    it('throws a meaningful error when local and source disagree on the genesis hash', async () => {
      // Source advertises blocks 1-3 with the default mock genesis hash (Fr.ZERO).
      setRemoteTips(3);
      localData.proposed.number = BlockNumber(3);
      // Local store disagrees at every height including block 0 (e.g. different genesisTimestamp).
      localData.blockHashes[0] = `0xbad0`;
      for (let i = 1; i <= 3; i++) {
        localData.blockHashes[i] = `0xbad${i}`;
      }

      // The reorg-search loop must NOT walk past block 0; it should throw a clear error
      // pointing at the genesis-hash mismatch instead of cascading into "block hash not found
      // for -1" further down. The error is caught and logged by `work` rather than rethrown.
      const log = mock<Logger>();
      blockStream = new TestL2BlockStream(blockSource, localData, handler, log, { batchSize: 10 });

      await blockStream.work();

      expect(handler.events).toEqual([]);
      expect(log.error).toHaveBeenCalledWith(expect.stringContaining('Genesis block hash mismatch'), expect.anything());
    });
  });

  describe('A-1061 regression: startingBlock past the source checkpointed tip', () => {
    let localData: TestL2BlockStreamLocalDataProvider;
    let handler: TestL2BlockStreamEventHandler;
    let blockStream: TestL2BlockStream;

    beforeEach(() => {
      localData = new TestL2BlockStreamLocalDataProvider();
      handler = new TestL2BlockStreamEventHandler();
    });

    it('emits the source checkpointed tip on the FIRST pass even when startingBlock is past it', async () => {
      // Source: checkpointed=30, proven=25, proposed=35. The node restarts with startingBlock=33 (past the
      // checkpointed tip of block 30). Pre-rewrite, the startingBlock fast-forward suppressed all checkpoint
      // emission, leaving the local checkpointed cursor stuck at genesis while proven still advanced.
      setRemoteTips(35, 30, 25, 10);
      blockStream = new TestL2BlockStream(blockSource, localData, handler, undefined, {
        batchSize: 10,
        startingBlock: 33,
      });

      await blockStream.work();

      const checkpointEvents = handler.events.filter(e => e.type === 'chain-checkpointed');
      expect(checkpointEvents).toEqual([checkpointedEvent(30)]);

      // proven is resolvable (block 25), and the checkpointed cursor is NOT stuck at genesis.
      const provenEvents = handler.events.filter(e => e.type === 'chain-proven');
      expect(provenEvents).toEqual([
        { type: 'chain-proven', block: makeBlockId(25), checkpoint: makeCheckpointId(25) },
      ]);
    });

    it('downloads blocks from startingBlock, not from genesis', async () => {
      setRemoteTips(35, 30, 25, 10);
      blockStream = new TestL2BlockStream(blockSource, localData, handler, undefined, {
        batchSize: 10,
        startingBlock: 33,
      });

      await blockStream.work();

      // First block download begins at startingBlock (33), skipping 1..32.
      expect(blockSource.getBlocks).toHaveBeenCalledWith({ from: BlockNumber(33), limit: 3 });
    });
  });

  describe('with memory tips store', () => {
    let localData: TestL2TipsMemoryStore;
    let handler: TestL2BlockStreamEventHandler;
    let blockStream: TestL2BlockStream;

    beforeEach(() => {
      localData = new TestL2TipsMemoryStore();
      handler = new TestL2BlockStreamEventHandler(localData);
      blockStream = new TestL2BlockStream(blockSource, localData, handler, undefined, { batchSize: 10 });
    });

    // Regression test for https://github.com/AztecProtocol/aztec-packages/issues/13471
    it('handles a prune to a block before start block', async () => {
      setRemoteTips(35, 30, 25, 10);
      blockStream = new TestL2BlockStream(blockSource, localData, handler, undefined, {
        batchSize: 10,
        startingBlock: 30,
      });

      // We first seed a few blocks into the blockstream: blocks 30-35 (startingBlock=30), plus the
      // checkpointed/proven/finalized reconciliation events.
      await blockStream.work();
      expect(handler.events).toEqual([
        { type: 'blocks-added', blocks: times(6, i => makeBlock(i + 30)) },
        checkpointedEvent(30),
        { type: 'chain-proven', block: makeBlockId(25), checkpoint: makeCheckpointId(25) },
        { type: 'chain-finalized', block: makeBlockId(10), checkpoint: makeCheckpointId(10) },
      ]);
      handler.clearEvents();

      // And then we reorg
      setRemoteTips(25, 25, 25, 10);
      await blockStream.work();
      expect(handler.events).toEqual([
        { type: 'chain-pruned', block: makeBlockId(25), checkpointed: makeTipId(25), proven: makeTipId(25) },
      ]);
    });

    // Regression: pruning to an uncheckpointed block ahead of the checkpointed tip must not reset the
    // checkpointed cursor, otherwise the next work() re-emits the checkpointed tip.
    it('does not re-emit the checkpointed tip after pruning to a block ahead of it', async () => {
      // Sync blocks 1-7: blocks 1-5 are checkpointed (checkpoint 5), blocks 6-7 uncheckpointed.
      setRemoteTips(7, 5);
      await blockStream.work();
      expect(handler.events.filter(e => e.type === 'chain-checkpointed')).toEqual([checkpointedEvent(5)]);
      handler.clearEvents();

      // Source drops its proposed tip to block 6 (uncheckpointed, still ahead of checkpointed=5).
      setRemoteTips(6, 5);
      await blockStream.work();
      expect(handler.events).toEqual([
        { type: 'chain-pruned', block: makeBlockId(6), checkpointed: makeTipId(5), proven: makeTipId(0) },
      ]);
      handler.clearEvents();

      // The next sync must NOT re-emit a chain-checkpointed event: the checkpointed cursor was left at
      // block 5 / checkpoint 5.
      await blockStream.work();
      expect(handler.events.filter(e => e.type === 'chain-checkpointed')).toEqual([]);
    });

    // prune + same-pass reconciliation: a prune walk-back and the catch-up tier events fire in one pass.
    it('emits the prune event and the new tier events in the same pass', async () => {
      // Sync up to a checkpointed/proven chain: proposed=9, checkpointed=9, proven=6, finalized=3.
      setRemoteTips(9, 9, 6, 3);
      await blockStream.work();
      handler.clearEvents();

      // Reorg: the source drops its proposed/checkpointed tip to block 6 (the memory store still holds 7-9,
      // which the source no longer serves) and finalized advances to 6 within the same snapshot.
      setRemoteTips(6, 6, 6, 6);
      await blockStream.work();

      // First the prune to block 6, then the finalized reconciliation event for the advanced finalized tip.
      expect(handler.events[0]).toEqual({
        type: 'chain-pruned',
        block: makeBlockId(6),
        checkpointed: makeTipId(6),
        proven: makeTipId(6),
      });
      const finalizedEvents = handler.events.filter(e => e.type === 'chain-finalized');
      expect(finalizedEvents).toEqual([
        { type: 'chain-finalized', block: makeBlockId(6), checkpoint: makeCheckpointId(6) },
      ]);
    });
  });

  describe('hash-gated tier reconciliation', () => {
    // World-state-shaped provider: reports `undefined` block hashes for its proven/finalized tips. The
    // reconciliation must skip the hash comparison so it does not re-emit on every poll.
    class WorldStateShapedProvider implements L2BlockStreamLocalDataProvider {
      public proposedNumber = BlockNumber.ZERO;
      public provenNumber = BlockNumber.ZERO;
      public finalizedNumber = BlockNumber.ZERO;

      public getL2BlockHash(number: number): Promise<string | undefined> {
        return Promise.resolve(number > this.proposedNumber ? undefined : new Fr(number).toString());
      }

      public getL2Tips(): Promise<LocalChainTips> {
        return Promise.resolve({
          proposed: { number: this.proposedNumber, hash: new Fr(this.proposedNumber).toString() },
          // proven/finalized hashes are intentionally undefined, as world-state reports them.
          proven: { block: { number: this.provenNumber } },
          finalized: { block: { number: this.finalizedNumber } },
        });
      }
    }

    it('does not re-emit proven/finalized when the local hash is undefined and numbers match', async () => {
      const localData = new WorldStateShapedProvider();
      const handler = new TestL2BlockStreamEventHandler();
      const blockStream = new TestL2BlockStream(blockSource, localData, handler, undefined, {
        batchSize: 10,
        ignoreCheckpoints: true,
      });

      // Source proven/finalized are at the same numbers the local provider already tracks.
      setRemoteTips(9, 0, 6, 3);
      localData.proposedNumber = BlockNumber(9);
      localData.provenNumber = BlockNumber(6);
      localData.finalizedNumber = BlockNumber(3);

      await blockStream.work();

      // Numbers match and local hashes are undefined ⇒ no re-emission.
      expect(handler.events.filter(e => e.type === 'chain-proven')).toEqual([]);
      expect(handler.events.filter(e => e.type === 'chain-finalized')).toEqual([]);
    });

    // Finding 3: a same-number, different-hash proven tip IS re-emitted.
    it('re-emits the proven tip when numbers match but the known local hash differs', async () => {
      const localData = new TestL2BlockStreamLocalDataProvider();
      const handler = new TestL2BlockStreamEventHandler();
      const blockStream = new TestL2BlockStream(blockSource, localData, handler, undefined, {
        batchSize: 10,
        ignoreCheckpoints: true,
      });

      setRemoteTips(9, 0, 6, 3);
      localData.proposed.number = BlockNumber(9);
      // Local proven sits at the same block number but a stale hash (e.g. a same-height reorg).
      localData.proven.block.number = BlockNumber(6);
      localData.proven.block.hash = '0xstale6';
      localData.finalized.block.number = BlockNumber(3);
      localData.finalized.block.hash = makeHash(3);

      await blockStream.work();

      expect(handler.events.filter(e => e.type === 'chain-proven')).toEqual([
        { type: 'chain-proven', block: makeBlockId(6), checkpoint: makeCheckpointId(6) },
      ]);
      // Finalized matched on both number and hash ⇒ not re-emitted.
      expect(handler.events.filter(e => e.type === 'chain-finalized')).toEqual([]);
    });
  });

  describe('ignoreCheckpoints', () => {
    let localData: TestL2BlockStreamLocalDataProvider;
    let handler: TestL2BlockStreamEventHandler;
    let blockStream: TestL2BlockStream;

    beforeEach(() => {
      localData = new TestL2BlockStreamLocalDataProvider();
      handler = new TestL2BlockStreamEventHandler();
      blockStream = new TestL2BlockStream(blockSource, localData, handler, undefined, {
        batchSize: 10,
        ignoreCheckpoints: true,
      });
    });

    it('does not emit checkpoint events for new checkpointed blocks', async () => {
      setRemoteTips(6, 6);

      await blockStream.work();

      expect(handler.events).toEqual([{ type: 'blocks-added', blocks: times(6, i => makeBlock(i + 1)) }]);
    });

    it('still emits prune events but no checkpoint events', async () => {
      setRemoteTips(9, 9);
      await blockStream.work();
      handler.clearEvents();

      localData.proposed.number = BlockNumber(9);
      localData.checkpointed.block.number = BlockNumber(9);
      localData.checkpointed.checkpoint.number = CheckpointNumber(9);
      for (let i = 4; i <= 9; i++) {
        localData.blockHashes[i] = `0xbad${i}`;
      }

      setRemoteTips(3, 3);
      await blockStream.work();

      expect(handler.events).toEqual([
        { type: 'chain-pruned', block: makeBlockId(3), checkpointed: makeTipId(3), proven: makeTipId(0) },
      ]);
    });

    it('still emits proven and finalized events', async () => {
      setRemoteTips(9, 9, 6, 3);

      await blockStream.work();

      expect(handler.events).toEqual([
        { type: 'blocks-added', blocks: times(9, i => makeBlock(i + 1)) },
        { type: 'chain-proven', block: makeBlockId(6), checkpoint: makeCheckpointId(6) },
        { type: 'chain-finalized', block: makeBlockId(3), checkpoint: makeCheckpointId(3) },
      ]);
    });
  });

  describe('skipFinalized', () => {
    let localData: TestL2BlockStreamLocalDataProvider;
    let handler: TestL2BlockStreamEventHandler;
    let blockStream: TestL2BlockStream;

    beforeEach(() => {
      localData = new TestL2BlockStreamLocalDataProvider();
      handler = new TestL2BlockStreamEventHandler();
      blockStream = new TestL2BlockStream(blockSource, localData, handler, undefined, {
        batchSize: 10,
        skipFinalized: true,
      });
    });

    it('skips ahead to the latest finalized block', async () => {
      setRemoteTips(40, 0, 38, 35);

      localData.setProposed(5);
      localData.setProven(2);
      localData.setFinalized(2);

      await blockStream.work();

      // Instead of fetching the next local block (6), we skip ahead to the latest finalized (35) and go from there.
      expect(handler.events).toEqual([
        { type: 'blocks-added', blocks: times(6, i => makeBlock(i + 35)) },
        { type: 'chain-proven', block: makeBlockId(38), checkpoint: makeCheckpointId(38) },
        { type: 'chain-finalized', block: makeBlockId(35), checkpoint: makeCheckpointId(35) },
      ] satisfies L2BlockStreamEvent[]);
    });

    it('does not skip if already ahead of finalized', async () => {
      setRemoteTips(40, 0, 38, 35);

      localData.setProposed(38);
      localData.setProven(38);
      localData.setFinalized(35);

      await blockStream.work();

      // proven and finalized tips already match the source on (number, hash), so only new blocks are emitted.
      expect(handler.events).toEqual([
        { type: 'blocks-added', blocks: times(2, i => makeBlock(i + 39)) },
      ] satisfies L2BlockStreamEvent[]);
    });
  });

  describe('local provider without checkpointed tip', () => {
    let localData: TestLocalChainTipsProvider;
    let handler: TestL2BlockStreamEventHandler;

    beforeEach(() => {
      localData = new TestLocalChainTipsProvider();
      handler = new TestL2BlockStreamEventHandler();
    });

    it('syncs blocks with ignoreCheckpoints when no checkpointed tip is provided', async () => {
      setRemoteTips(5, 5);
      const blockStream = new TestL2BlockStream(blockSource, localData, handler, undefined, {
        batchSize: 10,
        ignoreCheckpoints: true,
      });

      await blockStream.work();

      // All 5 blocks are synced and no checkpoint events are emitted.
      expect(handler.events).toEqual([{ type: 'blocks-added', blocks: times(5, i => makeBlock(i + 1)) }]);
      expect(handler.events.every(e => e.type === 'blocks-added')).toBe(true);
    });

    it('surfaces a loud error when checkpoint emission is enabled without a checkpointed tip', async () => {
      setRemoteTips(5, 5);
      const log = mock<Logger>();
      const blockStream = new TestL2BlockStream(blockSource, localData, handler, log, { batchSize: 10 });

      await blockStream.work();

      expect(handler.events).toEqual([]);
      expect(log.error).toHaveBeenCalledWith(
        `Error processing block stream`,
        expect.objectContaining({ message: expect.stringContaining('does not expose a checkpointed tip') }),
      );
    });
  });

  describe('walk-back missing-local-hash regression', () => {
    // A missing LOCAL hash must compare UNEQUAL, so the walk-back continues past sparse gaps to the true divergence
    // (or genesis) and the prune target never lands ABOVE the divergence. Uses the memory store for genuinely sparse
    // history (heights never written have no hash).
    let localData: TestL2TipsMemoryStore;
    let handler: TestL2BlockStreamEventHandler;

    beforeEach(() => {
      localData = new TestL2TipsMemoryStore();
      handler = new TestL2BlockStreamEventHandler(localData);
    });

    it('walks past both-undefined heights when the source proposed tip dropped below the local tip', async () => {
      // Block-mode sync to proposed=10 (records dense hashes 1-10).
      const blockStream = new TestL2BlockStream(blockSource, localData, handler, undefined, {
        batchSize: 10,
        ignoreCheckpoints: true,
      });
      setRemoteTips(10);
      await blockStream.work();
      handler.clearEvents();

      // Now drop a gap into the local history: delete the hash for block 7 (simulating sparse history), so the
      // walk-back hits a both-undefined height inside (sourceProposed, localProposed].
      const store = localData as unknown as { blockHashes: Map<number, string> };
      store.blockHashes.delete(7);

      // Source reorgs below the local proposed tip: blocks 4+ changed, new proposed=6 on a fork. Block 4 onward has
      // new hashes; the source no longer serves blocks above 6. True divergence is after block 3.
      blockSource.getBlockData.mockImplementation(query => {
        if (!('number' in query) || query.number > 6) {
          return Promise.resolve(undefined);
        }
        const forked = query.number >= 4;
        return Promise.resolve({
          header: { hash: () => Promise.resolve(new BlockHash(new Fr(forked ? query.number + 1000 : query.number))) },
        } as unknown as BlockData);
      });
      blockSource.getL2Tips.mockResolvedValue({
        proposed: { number: BlockNumber(6), hash: new Fr(1006).toString() },
        checkpointed: makeTipId(0),
        proven: makeTipId(0),
        finalized: makeTipId(0),
      });

      await blockStream.work();

      // The walk continues past the missing height (7) and the forked heights; the prune target lands at or below the
      // true divergence (block 3), never above it.
      const pruneEvents = handler.events.filter(
        (e): e is Extract<L2BlockStreamEvent, { type: 'chain-pruned' }> => e.type === 'chain-pruned',
      );
      expect(pruneEvents).toHaveLength(1);
      expect(pruneEvents[0].block.number).toBeLessThanOrEqual(3);
    });

    // Seeding the walk-back cache with a stale tier tip poisons the walk: the snapshot's checkpointed tip sits at a
    // reorged height carrying the OLD-fork hash, so it equals the local old-fork hash there and fakes agreement,
    // stopping the walk ABOVE the true divergence (an under-deep prune). Only the proposed tip may seed the cache.
    it('does not stop the walk-back at a stale tier-tip seed when the source reorged after the snapshot', async () => {
      // Block-mode sync to proposed=10 (records dense old-fork hashes 1-10).
      const blockStream = new TestL2BlockStream(blockSource, localData, handler, undefined, {
        batchSize: 10,
        ignoreCheckpoints: true,
      });
      setRemoteTips(10);
      await blockStream.work();
      handler.clearEvents();

      // The source reorged after the snapshot. Live getBlockData reflects the post-reorg chain: heights 6-11 carry
      // new-fork hashes, heights <= 5 keep the old (shared) hashes. True divergence is after block 5.
      blockSource.getBlockData.mockImplementation(query => {
        if (!('number' in query) || query.number > 11) {
          return Promise.resolve(undefined);
        }
        const forked = query.number >= 6;
        return Promise.resolve({
          header: { hash: () => Promise.resolve(new BlockHash(new Fr(forked ? query.number + 1000 : query.number))) },
        } as unknown as BlockData);
      });

      // FIRST getL2Tips (the pass snapshot) reports proposed=11 (old-fork hash, so the walk's first comparison at 10
      // misses the cache) and checkpointed=8 with the OLD-fork hash — the stale tier seed that, if cached, equals the
      // local old-fork hash at the reorged height 8 and stops the walk there. The post-divergence re-read returns the
      // fresh post-reorg tips (proposed=6 on the new fork).
      let getTipsCall = 0;
      blockSource.getL2Tips.mockImplementation(() => {
        getTipsCall++;
        return Promise.resolve(
          getTipsCall === 1
            ? {
                proposed: { number: BlockNumber(11), hash: makeHash(11) },
                checkpointed: makeTipId(8),
                proven: makeTipId(8),
                finalized: makeTipId(8),
              }
            : {
                proposed: { number: BlockNumber(6), hash: new Fr(1006).toString() },
                checkpointed: makeTipId(0),
                proven: makeTipId(0),
                finalized: makeTipId(0),
              },
        );
      });

      await blockStream.work();

      // The walk must reach the true divergence at block 5, NOT stop at the poisoned tier seed (block 8).
      const pruneEvents = handler.events.filter(
        (e): e is Extract<L2BlockStreamEvent, { type: 'chain-pruned' }> => e.type === 'chain-pruned',
      );
      expect(pruneEvents).toHaveLength(1);
      expect(pruneEvents[0].block.number).toBeLessThanOrEqual(5);
    });
  });

  describe('pass atomicity (block mode)', () => {
    let localData: TestL2TipsMemoryStore;
    let handler: TestL2BlockStreamEventHandler;
    let blockStream: TestL2BlockStream;

    beforeEach(() => {
      localData = new TestL2TipsMemoryStore();
      handler = new TestL2BlockStreamEventHandler(localData);
      blockStream = new TestL2BlockStream(blockSource, localData, handler, undefined, {
        batchSize: 10,
        ignoreCheckpoints: true,
      });
    });

    // (a) Empty getBlocks mid-plan: the source advertises a proposed tip it cannot deliver. No tier events fire; the
    // next pass (with a deliverable tip) reconciles.
    it('skips reconciliation when getBlocks returns empty below the target, then recovers next pass', async () => {
      // Source advertises proposed=10 and finalized=8, but getBlocks delivers nothing (blocks not actually available).
      blockSource.getL2Tips.mockResolvedValue({
        proposed: { number: BlockNumber(10), hash: makeHash(10) },
        checkpointed: makeTipId(0),
        proven: makeTipId(0),
        finalized: makeTipId(8),
      });
      blockSource.getBlocks.mockResolvedValue([]);

      await blockStream.work();

      // No blocks delivered ⇒ plan incomplete ⇒ no finalized (or any tier) event this pass.
      expect(handler.events.filter(e => e.type === 'chain-finalized')).toEqual([]);

      // Next pass the source can deliver: reconciliation runs and the tiers catch up.
      blockSource.getBlocks.mockImplementation((query: BlocksQuery) =>
        'from' in query
          ? Promise.resolve(
              compactArray(times(query.limit, i => (query.from + i > 10 ? undefined : makeBlock(query.from + i)))),
            )
          : Promise.resolve([]),
      );
      latest = 10;
      handler.clearEvents();

      await blockStream.work();
      expect(handler.events.filter(e => e.type === 'chain-finalized')).toEqual([
        { type: 'chain-finalized', block: makeBlockId(8), checkpoint: makeCheckpointId(8) },
      ]);
    });

    // (b) Loop completes but the last block's hash differs from the snapshot proposed hash: a same-height fork swap
    // happened mid-pass. No tier events.
    it('skips reconciliation when the delivered proposed-block hash differs from the snapshot', async () => {
      // Snapshot proposed hash is makeHash(5), but getBlocks delivers a block 5 carrying a different (forked) hash.
      blockSource.getL2Tips.mockResolvedValue({
        proposed: { number: BlockNumber(5), hash: makeHash(5) },
        checkpointed: makeTipId(0),
        proven: makeTipId(0),
        finalized: makeTipId(3),
      });
      blockSource.getBlocks.mockResolvedValue(times(5, i => makeForkedBlock(i + 1)));

      await blockStream.work();

      // The delivered block-5 hash (forked) != snapshot proposed hash ⇒ plan incomplete ⇒ no tier events.
      expect(handler.events.filter(e => e.type === 'chain-finalized')).toEqual([]);
      // blocks-added still emitted (it only populates hash history).
      expect(handler.events.filter(e => e.type === 'blocks-added')).toHaveLength(1);
    });

    // (c) startingBlock fast-forward past the tip still reconciles (A-1061 regression): the loop never runs, the plan
    // is trivially complete, and the snapshot tiers are emitted.
    it('reconciles when startingBlock fast-forwards past the proposed tip (A-1061)', async () => {
      const freshStore = new TestL2TipsMemoryStore();
      const freshHandler = new TestL2BlockStreamEventHandler(freshStore);
      const stream = new TestL2BlockStream(blockSource, freshStore, freshHandler, undefined, {
        startingBlock: 40,
        ignoreCheckpoints: true,
      });
      setRemoteTips(35, 0, 25, 10);

      await stream.work();

      // The download loop never runs (startingBlock 40 > proposed 35), yet proven/finalized still reconcile.
      expect(freshHandler.events.filter(e => e.type === 'chain-proven')).toEqual([
        { type: 'chain-proven', block: makeBlockId(25), checkpoint: makeCheckpointId(25) },
      ]);
      expect(freshHandler.events.filter(e => e.type === 'chain-finalized')).toEqual([
        { type: 'chain-finalized', block: makeBlockId(10), checkpoint: makeCheckpointId(10) },
      ]);
    });
  });

  describe('prune payload freshness', () => {
    // The walk-back detection uses live getBlockData reads; the prune event's clamp payload must come from a re-read
    // taken AFTER divergence is detected, not from the (now stale) pass snapshot.
    let localData: TestL2TipsMemoryStore;
    let handler: TestL2BlockStreamEventHandler;

    beforeEach(() => {
      localData = new TestL2TipsMemoryStore();
      handler = new TestL2BlockStreamEventHandler(localData);
    });

    it('carries the re-read checkpointed/proven tips on the prune event, not the snapshot ones', async () => {
      const blockStream = new TestL2BlockStream(blockSource, localData, handler, undefined, { batchSize: 10 });
      // Sync to proposed=10, checkpointed=10, proven=10, finalized=0.
      setRemoteTips(10, 10, 10, 0);
      await blockStream.work();
      handler.clearEvents();

      // The reorg drops the source to proposed=6 (blocks 7-10 gone; 1-6 unchanged). Between the pass snapshot and the
      // walk-back the source's confirmed tips move: the FIRST getL2Tips (snapshot) still reports the proven tip behind
      // at block 4; the SECOND (post-divergence re-read) reports it caught up to 6. The stream must clamp the prune
      // event from the re-read, not the snapshot, so p2p's isEpochPrune sees the checkpoint id AFTER the prune.
      let getTipsCall = 0;
      blockSource.getL2Tips.mockImplementation(() => {
        getTipsCall++;
        if (getTipsCall === 1) {
          // Pass snapshot: proven still lagging at block 4 (valid: proven <= checkpointed <= proposed).
          return Promise.resolve({
            proposed: { number: BlockNumber(6), hash: makeHash(6) },
            checkpointed: makeTipId(6),
            proven: makeTipId(4),
            finalized: makeTipId(0),
          });
        }
        // Post-divergence re-read: the confirmed post-prune chain (proven caught up to 6).
        return Promise.resolve({
          proposed: { number: BlockNumber(6), hash: makeHash(6) },
          checkpointed: makeTipId(6),
          proven: makeTipId(6),
          finalized: makeTipId(0),
        });
      });
      latest = 6;

      await blockStream.work();

      const pruneEvent = handler.events.find(
        (e): e is Extract<L2BlockStreamEvent, { type: 'chain-pruned' }> => e.type === 'chain-pruned',
      );
      expect(pruneEvent).toBeDefined();
      // Clamp payload comes from the re-read (proven=6), NOT the stale snapshot (proven=4).
      expect(pruneEvent!.checkpointed).toEqual(makeTipId(6));
      expect(pruneEvent!.proven).toEqual(makeTipId(6));
    });

    // The re-read drives more than the prune clamp: the download loop must run THROUGH the re-read proposed tip and
    // tier reconciliation must use the re-read tiers. First snapshot proposed=5/proven=4, re-read proposed=8/proven=6.
    it('downloads through the re-read proposed tip and reconciles from the re-read tiers', async () => {
      const store = new TestL2TipsMemoryStore();
      const storeHandler = new TestL2BlockStreamEventHandler(store);
      const blockStream = new TestL2BlockStream(blockSource, store, storeHandler, undefined, {
        batchSize: 10,
        ignoreCheckpoints: true,
      });

      // Sync the local store to proposed=5 on the old fork (dense hashes 1-5).
      setRemoteTips(5);
      await blockStream.work();
      storeHandler.clearEvents();
      blockSource.getBlocks.mockClear();

      // Reorg after block 3: heights 1-3 keep their old (shared) hashes, heights 4+ are on the new fork. The new fork
      // extends to proposed=8.
      blockSource.getBlockData.mockImplementation(query => {
        if (!('number' in query) || query.number > 8) {
          return Promise.resolve(undefined);
        }
        const forked = query.number >= 4;
        return Promise.resolve({
          header: { hash: () => Promise.resolve(new BlockHash(new Fr(forked ? query.number + 1000 : query.number))) },
        } as unknown as BlockData);
      });
      blockSource.getBlocks.mockImplementation((query: BlocksQuery) =>
        'from' in query
          ? Promise.resolve(
              compactArray(
                times(query.limit, i => {
                  const n = query.from + i;
                  return n > 8 ? undefined : n >= 4 ? makeForkedBlock(n) : makeBlock(n);
                }),
              ),
            )
          : Promise.resolve([]),
      );

      // FIRST snapshot: a same-height fork already swapped block 5 (forked hash, != the local old-fork hash there), so
      // the walk detects divergence and walks down to block 3 before re-reading; proven still lags at 4. The re-read
      // reports the post-reorg chain: proposed=8 (new-fork hash), proven=6.
      let getTipsCall = 0;
      blockSource.getL2Tips.mockImplementation(() => {
        getTipsCall++;
        return Promise.resolve(
          getTipsCall === 1
            ? {
                proposed: { number: BlockNumber(5), hash: new Fr(1005).toString() },
                checkpointed: makeTipId(5),
                proven: makeTipId(4),
                finalized: makeTipId(0),
              }
            : {
                proposed: { number: BlockNumber(8), hash: new Fr(1008).toString() },
                checkpointed: {
                  block: { number: BlockNumber(8), hash: new Fr(1008).toString() },
                  checkpoint: makeCheckpointId(8),
                },
                proven: {
                  block: { number: BlockNumber(6), hash: new Fr(1006).toString() },
                  checkpoint: makeCheckpointId(6),
                },
                finalized: makeTipId(0),
              },
        );
      });

      await blockStream.work();

      // The download loop must run through the re-read proposed tip (8), not the stale snapshot tip (5): the highest
      // requested block reaches 8.
      const requestedThrough = Math.max(
        ...blockSource.getBlocks.mock.calls.map(([q]) => ('from' in q ? q.from + q.limit - 1 : 0)),
      );
      expect(requestedThrough).toBeGreaterThanOrEqual(8);

      // Tier reconciliation uses the re-read tiers: chain-proven carries the re-read proven tip (6), not the snapshot's
      // lagging tip (4).
      const provenEvents = storeHandler.events.filter(
        (e): e is Extract<L2BlockStreamEvent, { type: 'chain-proven' }> => e.type === 'chain-proven',
      );
      expect(provenEvents).toHaveLength(1);
      expect(provenEvents[0].block.number).toBe(6);
    });
  });

  describe('walk-back floor and source coherence', () => {
    let localData: TestL2BlockStreamLocalDataProvider;
    let handler: TestL2BlockStreamEventHandler;

    beforeEach(() => {
      localData = new TestL2BlockStreamLocalDataProvider();
      handler = new TestL2BlockStreamEventHandler();
    });

    it('stops the walk-back at the local finalized tip instead of pruning deeper', async () => {
      // Local synced to 10 with finalized at 5. The source disagrees on every height from 3 up — a fork reaching
      // below our finalized tip, which no legitimate reorg can produce (finalized means the proof tx is itself
      // L1-final). Its proposed tip is 8 with blocks 3-8 carrying forked hashes.
      localData.setProposed(10);
      localData.setFinalized(5);
      blockSource.getL2Tips.mockResolvedValue({
        proposed: { number: BlockNumber(8), hash: new Fr(1008).toString() },
        checkpointed: makeTipId(0),
        proven: makeTipId(0),
        finalized: makeTipId(0),
      });
      blockSource.getBlockData.mockImplementation(query => {
        if (!('number' in query) || query.number > 8) {
          return Promise.resolve(undefined);
        }
        const forked = query.number >= 3;
        return Promise.resolve({
          header: { hash: () => Promise.resolve(new BlockHash(new Fr(forked ? query.number + 1000 : query.number))) },
        } as unknown as BlockData);
      });

      const log = mock<Logger>();
      const blockStream = new TestL2BlockStream(blockSource, localData, handler, log, { batchSize: 10 });
      await blockStream.work();

      // The walk stops at the floor: the prune target is the finalized tip (5), never the true divergence (2).
      const pruneEvents = handler.events.filter(
        (e): e is Extract<L2BlockStreamEvent, { type: 'chain-pruned' }> => e.type === 'chain-pruned',
      );
      expect(pruneEvents).toHaveLength(1);
      expect(pruneEvents[0].block.number).toBe(5);
      expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('stopping the walk-back'), expect.anything());
    });

    it('aborts the pass when the source has no data below its own proposed tip, then recovers', async () => {
      // Local synced to 10; the source advertises proposed=12 but cannot serve block 10 (e.g. mid-unwind on the
      // source, or a transient read failure). Treating the unreadable height as divergence would walk the prune
      // deeper on phantom evidence, so the pass must be skipped instead.
      localData.setProposed(10);
      setRemoteTips(12);
      blockSource.getBlockData.mockResolvedValue(undefined);

      const log = mock<Logger>();
      const blockStream = new TestL2BlockStream(blockSource, localData, handler, log, { batchSize: 10 });
      await blockStream.work();

      expect(handler.events).toEqual([]);
      expect(log.warn).toHaveBeenCalledWith(
        expect.stringContaining('no data for a block at or below its proposed tip'),
        expect.anything(),
      );

      // Next pass the source serves data again: the stream catches up normally with no prune.
      blockSource.getBlockData.mockImplementation(query =>
        Promise.resolve(
          'number' in query && query.number <= 12 ? makeBlockData(query.number, query.number) : undefined,
        ),
      );
      await blockStream.work();
      expect(handler.events.filter(e => e.type === 'chain-pruned')).toEqual([]);
      expect(handler.events.filter(e => e.type === 'blocks-added')).toHaveLength(1);
    });

    it('still allows a legitimate prune to genesis when nothing is finalized', async () => {
      // Local synced to 10 with finalized still at 0 (nothing proven or finalized yet, e.g. a young chain). The
      // source forked from genesis: blocks 1-4 carry forked hashes. With no finalized floor, the walk may legally
      // reach block 0 and the prune-to-genesis goes through.
      localData.setProposed(10);
      blockSource.getL2Tips.mockResolvedValue({
        proposed: { number: BlockNumber(4), hash: new Fr(1004).toString() },
        checkpointed: makeTipId(0),
        proven: makeTipId(0),
        finalized: makeTipId(0),
      });
      blockSource.getBlockData.mockImplementation(query => {
        if (!('number' in query) || query.number > 4) {
          return Promise.resolve(undefined);
        }
        const forked = query.number >= 1;
        return Promise.resolve({
          header: { hash: () => Promise.resolve(new BlockHash(new Fr(forked ? query.number + 1000 : query.number))) },
        } as unknown as BlockData);
      });

      const blockStream = new TestL2BlockStream(blockSource, localData, handler, undefined, { batchSize: 10 });
      await blockStream.work();

      const pruneEvents = handler.events.filter(
        (e): e is Extract<L2BlockStreamEvent, { type: 'chain-pruned' }> => e.type === 'chain-pruned',
      );
      expect(pruneEvents).toHaveLength(1);
      expect(pruneEvents[0].block.number).toBe(0);
    });
  });
});

/** Shared block-hash function: hashes `this.number`. A single reference so makeBlock(n) objects compare equal. */
function blockHashFromNumber(this: { number: number }): Promise<BlockHash> {
  return Promise.resolve(new BlockHash(new Fr(this.number)));
}

/** Shared forked block-hash function: hashes `this.number + 1000`, simulating a same-height fork swap. */
function forkedBlockHashFromNumber(this: { number: number }): Promise<BlockHash> {
  return Promise.resolve(new BlockHash(new Fr(this.number + 1000)));
}

/** A block whose hash is forked (number + 1000), used to simulate same-height fork swaps. */
function makeForkedBlock(number: number) {
  return {
    number: BlockNumber(number),
    checkpointNumber: CheckpointNumber(number),
    indexWithinCheckpoint: 0,
    hash: forkedBlockHashFromNumber,
  } as unknown as L2Block;
}

/** Builds a checkpoint id from a plain number, isolated so the branded-type lint rule sees no BlockNumber flow. */
function makeTipCheckpointId(checkpointNumber: number) {
  return { number: CheckpointNumber(checkpointNumber), hash: new Fr(checkpointNumber).toString() };
}

class TestL2BlockStreamEventHandler implements L2BlockStreamEventHandler {
  public readonly events: L2BlockStreamEvent[] = [];
  public throwing: boolean = false;
  public callCount: number = 0;

  constructor(private forwardedTo?: L2BlockStreamEventHandler) {}

  async handleBlockStreamEvent(event: L2BlockStreamEvent): Promise<void> {
    if (this.forwardedTo) {
      await this.forwardedTo.handleBlockStreamEvent(event);
    }
    this.callCount++;
    if (this.throwing) {
      throw new Error('Handler error');
    }
    this.events.push(event);
  }

  clearEvents() {
    this.events.length = 0;
  }
}

class TestL2BlockStreamLocalDataProvider implements L2BlockStreamLocalDataProvider {
  public readonly blockHashes: Record<number, string> = {};

  // Genesis tip hashes match `getL2BlockHash(0)` (`new Fr(0)`) and the mock source's genesis tips
  // (`makeHash(0)`), so the tier reconciliation finds no spurious difference at genesis.
  public proposed = { number: BlockNumber.ZERO, hash: new Fr(0).toString() };
  public checkpointed = {
    block: { number: BlockNumber.ZERO, hash: new Fr(0).toString() },
    checkpoint: { number: CheckpointNumber.ZERO, hash: new Fr(0).toString() },
  };
  public proven = {
    block: { number: BlockNumber.ZERO, hash: new Fr(0).toString() },
    checkpoint: { number: CheckpointNumber.ZERO, hash: new Fr(0).toString() },
  };
  public finalized = {
    block: { number: BlockNumber.ZERO, hash: new Fr(0).toString() },
    checkpoint: { number: CheckpointNumber.ZERO, hash: new Fr(0).toString() },
  };

  /** Sets a tip's number and a matching hash, so the tier reconciliation sees consistent (number, hash) pairs. */
  public setProposed(number: number) {
    this.proposed = { number: BlockNumber(number), hash: new Fr(number).toString() };
  }

  public setCheckpointed(blockNumber: number, checkpointNumber: number) {
    this.checkpointed = {
      block: { number: BlockNumber(blockNumber), hash: new Fr(blockNumber).toString() },
      checkpoint: makeTipCheckpointId(checkpointNumber),
    };
  }

  public setProven(blockNumber: number) {
    this.proven = {
      block: { number: BlockNumber(blockNumber), hash: new Fr(blockNumber).toString() },
      checkpoint: makeTipCheckpointId(blockNumber),
    };
  }

  public setFinalized(blockNumber: number) {
    this.finalized = {
      block: { number: BlockNumber(blockNumber), hash: new Fr(blockNumber).toString() },
      checkpoint: makeTipCheckpointId(blockNumber),
    };
  }

  public getL2BlockHash(number: number): Promise<string | undefined> {
    return Promise.resolve(
      number > this.proposed.number ? undefined : (this.blockHashes[number] ?? new Fr(number).toString()),
    );
  }

  public getL2Tips(): Promise<LocalL2Tips> {
    return Promise.resolve({
      proposed: this.proposed,
      checkpointed: this.checkpointed,
      proven: this.proven,
      finalized: this.finalized,
    });
  }
}

/** Local provider that omits `checkpointed`, mirroring world-state's `ignoreCheckpoints` configuration. */
class TestLocalChainTipsProvider implements L2BlockStreamLocalDataProvider {
  public readonly blockHashes: Record<number, string> = {};

  public proposed = { number: BlockNumber.ZERO, hash: new Fr(0).toString() };
  public proven = { block: { number: BlockNumber.ZERO, hash: new Fr(0).toString() } };
  public finalized = { block: { number: BlockNumber.ZERO, hash: new Fr(0).toString() } };

  public getL2BlockHash(number: number): Promise<string | undefined> {
    return Promise.resolve(
      number > this.proposed.number ? undefined : (this.blockHashes[number] ?? new Fr(number).toString()),
    );
  }

  public getL2Tips(): Promise<LocalChainTips> {
    return Promise.resolve({
      proposed: this.proposed,
      proven: this.proven,
      finalized: this.finalized,
    });
  }
}

class TestL2BlockStream extends L2BlockStream {
  public running = true;

  public override work() {
    return super.work();
  }

  public override isRunning(): boolean {
    return this.running;
  }
}

class TestL2TipsMemoryStore extends L2TipsMemoryStore {
  constructor() {
    // initialBlockHash must match the test mock's genesis hash (new Fr(0)) so that
    // areBlockHashesEqualAt(0) compares matching values and finds no reorg at genesis.
    super(new BlockHash(new Fr(0)));
  }

  protected override computeBlockHash(block: L2Block): Promise<`0x${string}`> {
    return Promise.resolve(new Fr(block.number).toString());
  }
}
