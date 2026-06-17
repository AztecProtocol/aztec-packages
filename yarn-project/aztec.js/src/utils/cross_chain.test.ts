import { CheckpointNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { BlockData } from '@aztec/stdlib/block';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';

import { type MockProxy, mock } from 'jest-mock-extended';

import { isL1ToL2MessageReady } from './cross_chain.js';

describe('isL1ToL2MessageReady', () => {
  let node: MockProxy<Pick<AztecNode, 'getBlockData' | 'getL1ToL2MessageCheckpoint'>>;
  let messageHash: Fr;

  const blockAtCheckpoint = (checkpointNumber: number) =>
    ({ checkpointNumber: CheckpointNumber(checkpointNumber) }) as BlockData;

  beforeEach(() => {
    node = mock();
    messageHash = Fr.random();
  });

  it('returns false when the message is not yet in any checkpoint', async () => {
    node.getL1ToL2MessageCheckpoint.mockResolvedValue(undefined);

    expect(await isL1ToL2MessageReady(node, messageHash)).toBe(false);
    expect(node.getBlockData).not.toHaveBeenCalled();
  });

  describe('latest fallback (no chain tip)', () => {
    beforeEach(() => {
      node.getL1ToL2MessageCheckpoint.mockResolvedValue(CheckpointNumber(5));
    });

    it('checks readiness against the latest block', async () => {
      node.getBlockData.mockResolvedValue(blockAtCheckpoint(5));

      expect(await isL1ToL2MessageReady(node, messageHash)).toBe(true);
      expect(node.getBlockData).toHaveBeenCalledWith('latest');
    });

    it('returns true once the latest block reaches the message checkpoint', async () => {
      node.getBlockData.mockResolvedValue(blockAtCheckpoint(6));

      expect(await isL1ToL2MessageReady(node, messageHash)).toBe(true);
    });

    it('returns false when the latest block is behind the message checkpoint', async () => {
      node.getBlockData.mockResolvedValue(blockAtCheckpoint(4));

      expect(await isL1ToL2MessageReady(node, messageHash)).toBe(false);
    });

    it('returns false when there is no block', async () => {
      node.getBlockData.mockResolvedValue(undefined);

      expect(await isL1ToL2MessageReady(node, messageHash)).toBe(false);
    });
  });

  describe('with an explicit chain tip', () => {
    beforeEach(() => {
      node.getL1ToL2MessageCheckpoint.mockResolvedValue(CheckpointNumber(5));
    });

    it('compares against the requested tip instead of latest', async () => {
      // The proven tip lags behind latest: the message is in checkpoint 5 but proven is only at 4.
      node.getBlockData.mockImplementation(param =>
        Promise.resolve(param === 'proven' ? blockAtCheckpoint(4) : blockAtCheckpoint(6)),
      );

      expect(await isL1ToL2MessageReady(node, messageHash, 'latest')).toBe(true);
      expect(await isL1ToL2MessageReady(node, messageHash, 'proven')).toBe(false);
      expect(node.getBlockData).toHaveBeenLastCalledWith('proven');
    });

    it('returns true once the requested tip reaches the message checkpoint', async () => {
      node.getBlockData.mockImplementation(param =>
        Promise.resolve(param === 'proven' ? blockAtCheckpoint(5) : blockAtCheckpoint(7)),
      );

      expect(await isL1ToL2MessageReady(node, messageHash, 'proven')).toBe(true);
    });
  });
});
