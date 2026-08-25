import { createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import { Timer } from '@aztec/foundation/timer';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { GENESIS_BLOCK_HEADER_HASH } from '@aztec/stdlib/block';
import type { PublishedCheckpoint } from '@aztec/stdlib/checkpoint';
import { SiloedTag } from '@aztec/stdlib/logs';
import type { AppendOnlyTreeSnapshot } from '@aztec/stdlib/trees';

import { jest } from '@jest/globals';

import { makeCheckpointWithLogs } from '../test/mock_structs.js';
import { BlockStore } from './block_store.js';
import { LogStore } from './log_store.js';

const BLOCKS_TO_SEED = 5;
const TXS_PER_BLOCK = 4;
const LOGS_PER_TX = 5;
const TAGS_PER_QUERY = 100;

/** Number of artificial write transactions queued in front of the contended read. */
const QUEUED_WRITES = 5;
/** Duration of each artificial write transaction. */
const WRITE_DURATION_MS = 50;

describe('LogStore write contention', () => {
  jest.setTimeout(60_000);

  const logger = createLogger('archiver:log_store_write_contention_test');

  let db: AztecAsyncKVStore;
  let blockStore: BlockStore;
  let logStore: LogStore;
  let tags: SiloedTag[];

  beforeEach(async () => {
    db = await openTmpStore('log_store_write_contention_test');
    blockStore = new BlockStore(db);
    logStore = new LogStore(db, blockStore, GENESIS_BLOCK_HEADER_HASH);

    const checkpoints: PublishedCheckpoint[] = [];
    let previousArchive: AppendOnlyTreeSnapshot | undefined;
    for (let blockNumber = 1; blockNumber <= BLOCKS_TO_SEED; blockNumber++) {
      const ckpt = await makeCheckpointWithLogs(blockNumber, {
        numTxsPerBlock: TXS_PER_BLOCK,
        privateLogs: { numLogsPerTx: LOGS_PER_TX },
        previousArchive,
      });
      previousArchive = ckpt.checkpoint.blocks[0].archive;
      checkpoints.push(ckpt);
    }

    const blocks = checkpoints.map(c => c.checkpoint.blocks[0]);
    await blockStore.addCheckpoints(checkpoints);
    await logStore.addLogs(blocks);

    const harvested: SiloedTag[] = [];
    for (const block of blocks) {
      for (const txEffect of block.body.txEffects) {
        for (const log of txEffect.privateLogs) {
          harvested.push(new SiloedTag(log.fields[0]));
        }
      }
    }
    tags = Array.from({ length: TAGS_PER_QUERY }, (_, i) => harvested[i % harvested.length]);
  });

  afterEach(async () => {
    await db.close();
  });

  it('returns the same results for a tag query racing queued write transactions', async () => {
    const baselineTimer = new Timer();
    const baseline = await logStore.getPrivateLogsByTags({ tags });
    const baselineMs = baselineTimer.ms();

    // Fill the store's serial writer queue without awaiting it.
    const writes = Array.from({ length: QUEUED_WRITES }, () => db.transactionAsync(() => sleep(WRITE_DURATION_MS)));

    const contendedTimer = new Timer();
    const contended = await logStore.getPrivateLogsByTags({ tags });
    const contendedMs = contendedTimer.ms();

    const queuedWriteMs = QUEUED_WRITES * WRITE_DURATION_MS;
    logger.info(`Baseline read ${baselineMs.toFixed(2)}ms, contended read ${contendedMs.toFixed(2)}ms`, {
      baselineMs,
      contendedMs,
      queuedWriteMs,
    });

    expect(contended.length).toBe(TAGS_PER_QUERY);
    expect(contended.every(logs => logs.length > 0)).toBe(true);
    expect(contended).toEqual(baseline);

    // The query runs on a read-only snapshot instead of the writer queue, so it must not wait for the queued writes.
    // Serializing behind them would cost the full `queuedWriteMs` on top of the baseline; half of that is left as
    // jitter headroom so the bound only trips when the read really is queued.
    expect(contendedMs).toBeLessThan(baselineMs + queuedWriteMs / 2);

    await Promise.all(writes);
  });
});
