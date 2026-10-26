import { BlockNumber, CheckpointNumber, IndexWithinCheckpoint } from '@aztec/foundation/branded-types';
import type { BlockData } from '@aztec/stdlib/block';

import { mock } from 'jest-mock-extended';

import type { WorldStateStatusSummary } from '../native/message.js';
import { getWorldStateHistoryStartCheckpoint, validateWorldStateHistory } from './history.js';

describe('world-state history policy', () => {
  const summary: WorldStateStatusSummary = {
    oldestHistoricalBlock: BlockNumber(80),
    unfinalizedBlockNumber: BlockNumber(120),
    finalizedBlockNumber: BlockNumber(100),
    treesAreSynched: true,
  };

  const blockSource = {
    getBlockData: () =>
      Promise.resolve(
        mock<BlockData>({
          checkpointNumber: CheckpointNumber(8),
          indexWithinCheckpoint: IndexWithinCheckpoint(0),
        }),
      ),
  };

  it('uses a fixed boundary in preference to the checkpoint count', () => {
    expect(
      getWorldStateHistoryStartCheckpoint({
        worldStateCheckpointHistory: 0,
        worldStatePruneBeforeCheckpoint: CheckpointNumber(90),
      }),
    ).toBe(90);
    expect(getWorldStateHistoryStartCheckpoint({ worldStateCheckpointHistory: 64 })).toBeUndefined();
    expect(getWorldStateHistoryStartCheckpoint({ worldStateCheckpointHistory: 0 })).toBe(0);
  });

  it.each([8, 9, 15])('accepts extra history when retaining from checkpoint %i', async start => {
    await expect(
      validateWorldStateHistory(
        { worldStateCheckpointHistory: 64, worldStatePruneBeforeCheckpoint: CheckpointNumber(start) },
        summary,
        blockSource,
      ),
    ).resolves.toBeUndefined();
  });

  it('rejects missing history before the pinned checkpoint', async () => {
    await expect(
      validateWorldStateHistory(
        { worldStateCheckpointHistory: 64, worldStatePruneBeforeCheckpoint: CheckpointNumber(7) },
        summary,
        blockSource,
      ),
    ).rejects.toThrow('history is required from the start of checkpoint 7');
  });

  it('rejects a pruned database when all history is requested', async () => {
    await expect(validateWorldStateHistory({ worldStateCheckpointHistory: 0 }, summary)).rejects.toThrow(
      'all checkpoint history is required',
    );
  });

  it('rejects pruned history when checkpoint zero is pinned', async () => {
    await expect(
      validateWorldStateHistory(
        { worldStateCheckpointHistory: 64, worldStatePruneBeforeCheckpoint: CheckpointNumber.ZERO },
        summary,
      ),
    ).rejects.toThrow('all checkpoint history is required');
  });

  it('accepts a fresh database and an unpruned database for genesis retention', async () => {
    for (const oldestHistoricalBlock of [BlockNumber.ZERO, BlockNumber(1)]) {
      await expect(
        validateWorldStateHistory({ worldStateCheckpointHistory: 0 }, { ...summary, oldestHistoricalBlock }),
      ).resolves.toBeUndefined();
    }
  });

  describe.each(['rolling', 'pinned'])('%s checkpoint retention', mode => {
    it.each([
      { checkpoint: 8, index: 2, compatible: true },
      { checkpoint: 9, index: 0, compatible: true },
      { checkpoint: 9, index: 1, compatible: false },
      { checkpoint: 10, index: 0, compatible: false },
    ])('requires complete checkpoints: %j', async ({ checkpoint, index, compatible }) => {
      const blocks = new Map([
        [
          100,
          mock<BlockData>({ checkpointNumber: CheckpointNumber(10), indexWithinCheckpoint: IndexWithinCheckpoint(3) }),
        ],
        [
          80,
          mock<BlockData>({
            checkpointNumber: CheckpointNumber(checkpoint),
            indexWithinCheckpoint: IndexWithinCheckpoint(index),
          }),
        ],
      ]);
      const result = validateWorldStateHistory(
        {
          worldStateCheckpointHistory: 2,
          worldStatePruneBeforeCheckpoint: mode === 'pinned' ? CheckpointNumber(9) : undefined,
        },
        summary,
        {
          getBlockData: query => Promise.resolve('number' in query ? blocks.get(query.number) : undefined),
        },
      );
      if (compatible) {
        await expect(result).resolves.toBeUndefined();
      } else {
        await expect(result).rejects.toThrow('history is required from the start of checkpoint 9');
      }
    });
  });
});
