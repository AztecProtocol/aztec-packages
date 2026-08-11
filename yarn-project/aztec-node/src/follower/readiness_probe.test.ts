import { BlockNumber } from '@aztec/foundation/branded-types';
import { WorldStateRunningState, type WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';

import { type MockProxy, mock } from 'jest-mock-extended';

import { type FollowerReadinessArchiver, createFollowerReadinessProbe } from './readiness_probe.js';

describe('createFollowerReadinessProbe', () => {
  let archiver: MockProxy<FollowerReadinessArchiver>;
  let worldState: MockProxy<Pick<WorldStateSynchronizer, 'status'>>;
  let probe: () => Promise<boolean>;

  const setWorldState = (state: WorldStateRunningState, latestBlockNumber: number) =>
    worldState.status.mockResolvedValue({
      state,
      syncSummary: {
        latestBlockNumber: BlockNumber(latestBlockNumber),
        latestBlockHash: '0x00',
        finalizedBlockNumber: BlockNumber.ZERO,
        oldestHistoricBlockNumber: BlockNumber.ZERO,
        treesAreSynched: true,
      },
    });

  beforeEach(() => {
    archiver = mock<FollowerReadinessArchiver>();
    archiver.getHealth.mockReturnValue({ initialSyncComplete: true });
    archiver.getBlockNumber.mockResolvedValue(BlockNumber(100));
    worldState = mock<Pick<WorldStateSynchronizer, 'status'>>();
    setWorldState(WorldStateRunningState.RUNNING, 100);
    probe = createFollowerReadinessProbe(archiver, worldState, 3);
  });

  it('is ready when the archiver synced once and world state agrees on the tip', async () => {
    await expect(probe()).resolves.toBe(true);
  });

  it('is not ready before the archiver completes its initial sync', async () => {
    archiver.getHealth.mockReturnValue({ initialSyncComplete: false });
    await expect(probe()).resolves.toBe(false);
  });

  it('is not ready while world state is still starting up', async () => {
    setWorldState(WorldStateRunningState.SYNCHING, 100);
    await expect(probe()).resolves.toBe(false);
  });

  it('tolerates world state trailing the archiver by less than the threshold', async () => {
    setWorldState(WorldStateRunningState.RUNNING, 97);
    await expect(probe()).resolves.toBe(true);
  });

  it('is not ready when world state falls behind the archiver, even while it reports running', async () => {
    setWorldState(WorldStateRunningState.RUNNING, 96);
    await expect(probe()).resolves.toBe(false);
  });

  it('is ready when world state momentarily leads the archiver during a prune', async () => {
    setWorldState(WorldStateRunningState.RUNNING, 105);
    await expect(probe()).resolves.toBe(true);
  });

  it('treats an empty archiver as block zero', async () => {
    archiver.getBlockNumber.mockResolvedValue(undefined);
    setWorldState(WorldStateRunningState.RUNNING, 0);
    await expect(probe()).resolves.toBe(true);
  });
});
