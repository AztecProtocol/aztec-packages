import type { RollupCheatCodes } from '@aztec/ethereum/test';
import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import { createLogger } from '@aztec/foundation/log';
import type { TypedEventEmitter } from '@aztec/foundation/types';
import type { SequencerEvents } from '@aztec/sequencer-client';
import type { L2BlockSource, L2Tips } from '@aztec/stdlib/block';

import { jest } from '@jest/globals';
import EventEmitter from 'node:events';

import { CheckpointAutoProver } from './checkpoint_auto_prover.js';

/** Builds a minimal L2Tips object with the given checkpointed checkpoint number. */
function makeTips(checkpointedNumber: number): L2Tips {
  const cp = CheckpointNumber(checkpointedNumber);
  const blockId = { number: BlockNumber(checkpointedNumber), hash: '0x' };
  return {
    proposed: blockId,
    checkpointed: { block: blockId, checkpoint: { number: cp, hash: '0x' } },
    proposedCheckpoint: { block: blockId, checkpoint: { number: cp, hash: '0x' } },
    proven: { block: blockId, checkpoint: { number: cp, hash: '0x' } },
    finalized: { block: blockId, checkpoint: { number: cp, hash: '0x' } },
  };
}

describe('CheckpointAutoProver', () => {
  const log = createLogger('test:checkpoint-auto-prover');

  let sequencer: TypedEventEmitter<SequencerEvents>;
  let getL2Tips: ReturnType<typeof jest.fn<() => Promise<L2Tips>>>;
  let getBlocks: ReturnType<typeof jest.fn>;
  let markAsProven: ReturnType<typeof jest.fn<(n?: CheckpointNumber) => Promise<void>>>;
  let prover: CheckpointAutoProver;

  beforeEach(() => {
    // Use a real EventEmitter cast to the typed interface so emits actually fire listeners.
    sequencer = new EventEmitter() as unknown as TypedEventEmitter<SequencerEvents>;

    getL2Tips = jest.fn<() => Promise<L2Tips>>();
    getBlocks = jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]);

    markAsProven = jest.fn<(n?: CheckpointNumber) => Promise<void>>().mockResolvedValue(undefined as unknown as void);

    prover = new CheckpointAutoProver(
      {
        sequencer,
        l2BlockSource: { getL2Tips, getBlocks } as unknown as L2BlockSource,
        rollupCheatCodes: { markAsProven } as unknown as RollupCheatCodes,
        log,
      },
      /* promoteTimeoutSecs= */ 5,
    );
  });

  afterEach(async () => {
    await prover.stop();
  });

  it('marks checkpoint proven after archiver promotes the tip', async () => {
    const checkpoint = CheckpointNumber(3);

    // Archiver initially reports checkpoint 0, then 3 after one poll.
    getL2Tips.mockResolvedValueOnce(makeTips(0)).mockResolvedValueOnce(makeTips(0)).mockResolvedValue(makeTips(3));

    prover.start();
    (sequencer as EventEmitter).emit('checkpoint-published', { checkpoint, slot: 10 });

    await prover.trigger();

    expect(markAsProven).toHaveBeenCalledWith(checkpoint);
  });

  it('does not mark as proven if archiver never promotes (timeout path)', async () => {
    const checkpoint = CheckpointNumber(5);

    // Archiver always returns stale tip (checkpoint 0).
    getL2Tips.mockResolvedValue(makeTips(0));

    // Use a very short timeout so the test is fast.
    prover = new CheckpointAutoProver(
      {
        sequencer,
        l2BlockSource: { getL2Tips, getBlocks } as unknown as L2BlockSource,
        rollupCheatCodes: { markAsProven } as unknown as RollupCheatCodes,
        log,
      },
      /* promoteTimeoutSecs= */ 1,
    );

    prover.start();
    (sequencer as EventEmitter).emit('checkpoint-published', { checkpoint, slot: 10 });

    // trigger() should return once the timed-out proveCheckpoint completes (no hang).
    await prover.trigger();

    // markAsProven must NOT have been called because the archiver never promoted.
    expect(markAsProven).not.toHaveBeenCalled();
  }, 10_000);

  it('stops cleanly while a wait is in flight', async () => {
    const checkpoint = CheckpointNumber(2);

    // Archiver takes a while to promote; stop() is called first.
    let resolvePromotion!: () => void;
    getL2Tips.mockImplementation(
      () =>
        new Promise<L2Tips>(resolve => {
          resolvePromotion = () => resolve(makeTips(2));
        }),
    );

    prover.start();
    (sequencer as EventEmitter).emit('checkpoint-published', { checkpoint, slot: 10 });

    // Let the worker enter the retryUntil loop once, then stop.
    await new Promise(resolve => setImmediate(resolve));

    // Resolve the pending poll so retryUntil can exit cleanly when stop() drains.
    resolvePromotion();

    // stop() should await the in-flight worker and return without hanging.
    await prover.stop();

    // The wait resolved so markAsProven may or may not have been called — but stop()
    // must have returned without throwing or hanging.
  });

  it('processes multiple checkpoint-published events in order', async () => {
    const cp1 = CheckpointNumber(1);
    const cp2 = CheckpointNumber(2);
    const cp3 = CheckpointNumber(3);

    const promotedAt: CheckpointNumber[] = [];

    // The archiver tip advances to 3 immediately, so each checkpoint's wait resolves right away.
    getL2Tips.mockResolvedValue(makeTips(3));
    markAsProven.mockImplementation((n?: CheckpointNumber) => {
      if (n !== undefined) {
        promotedAt.push(n);
      }
      return Promise.resolve();
    });

    prover.start();

    // Emit all three before the worker has a chance to run.
    (sequencer as EventEmitter).emit('checkpoint-published', { checkpoint: cp1, slot: 1 });
    (sequencer as EventEmitter).emit('checkpoint-published', { checkpoint: cp2, slot: 2 });
    (sequencer as EventEmitter).emit('checkpoint-published', { checkpoint: cp3, slot: 3 });

    await prover.trigger();

    // All three should have been processed in emission order.
    expect(promotedAt).toEqual([cp1, cp2, cp3]);
  });
});
