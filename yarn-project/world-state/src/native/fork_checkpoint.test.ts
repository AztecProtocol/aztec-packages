import type { MerkleTreeCheckpointOperations } from '@aztec/stdlib/interfaces/server';

import { type MockProxy, mock } from 'jest-mock-extended';

import { ForkCheckpoint } from './fork_checkpoint.js';

describe('ForkCheckpoint', () => {
  let fork: MockProxy<MerkleTreeCheckpointOperations>;

  beforeEach(() => {
    fork = mock<MerkleTreeCheckpointOperations>();
    fork.createCheckpoint.mockResolvedValue(5);
    fork.commitCheckpoint.mockResolvedValue();
    fork.revertCheckpoint.mockResolvedValue();
  });

  it('stores depth from createCheckpoint', async () => {
    const checkpoint = await ForkCheckpoint.new(fork);
    expect(checkpoint.depth).toBe(5);
    expect(fork.createCheckpoint).toHaveBeenCalledTimes(1);
  });

  it('commit calls commitCheckpoint on fork', async () => {
    const checkpoint = await ForkCheckpoint.new(fork);
    await checkpoint.commit();
    expect(fork.commitCheckpoint).toHaveBeenCalledTimes(1);
  });

  it('revert calls revertCheckpoint on fork', async () => {
    const checkpoint = await ForkCheckpoint.new(fork);
    await checkpoint.revert();
    expect(fork.revertCheckpoint).toHaveBeenCalledTimes(1);
  });

  it('revertToCheckpoint calls revertAllCheckpointsTo with depth', async () => {
    fork.revertAllCheckpointsTo.mockResolvedValue();
    const checkpoint = await ForkCheckpoint.new(fork);
    await checkpoint.revertToCheckpoint();
    expect(fork.revertAllCheckpointsTo).toHaveBeenCalledWith(4);
  });

  it('revertToCheckpoint prevents subsequent commit', async () => {
    fork.revertAllCheckpointsTo.mockResolvedValue();
    const checkpoint = await ForkCheckpoint.new(fork);
    await checkpoint.revertToCheckpoint();
    await checkpoint.commit();
    expect(fork.commitCheckpoint).not.toHaveBeenCalled();
  });

  it('revertToCheckpoint is idempotent', async () => {
    fork.revertAllCheckpointsTo.mockResolvedValue();
    const checkpoint = await ForkCheckpoint.new(fork);
    await checkpoint.revertToCheckpoint();
    await checkpoint.revertToCheckpoint();
    expect(fork.revertAllCheckpointsTo).toHaveBeenCalledTimes(1);
  });

  it('commit is idempotent', async () => {
    const checkpoint = await ForkCheckpoint.new(fork);
    await checkpoint.commit();
    await checkpoint.commit();
    expect(fork.commitCheckpoint).toHaveBeenCalledTimes(1);
  });

  it('revert is idempotent', async () => {
    const checkpoint = await ForkCheckpoint.new(fork);
    await checkpoint.revert();
    await checkpoint.revert();
    expect(fork.revertCheckpoint).toHaveBeenCalledTimes(1);
  });
});
