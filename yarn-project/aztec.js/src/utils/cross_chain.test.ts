import { Fr } from '@aztec/foundation/curves/bn254';
import type { BlockData } from '@aztec/stdlib/block';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';

import { type MockProxy, mock } from 'jest-mock-extended';

import { isL1ToL2MessageReady } from './cross_chain.js';

describe('isL1ToL2MessageReady', () => {
  let node: MockProxy<Pick<AztecNode, 'getBlockData' | 'getL1ToL2MessageIndex'>>;
  let messageHash: Fr;

  /** A block whose L1-to-L2 message tree holds `leafCount` leaves, i.e. leaf indices 0..leafCount-1. */
  const blockWithMessageLeaves = (leafCount: number) =>
    ({ header: { state: { l1ToL2MessageTree: { nextAvailableLeafIndex: leafCount } } } }) as BlockData;

  beforeEach(() => {
    node = mock();
    messageHash = Fr.random();
  });

  it('returns false when the node has not seen the message yet', async () => {
    node.getL1ToL2MessageIndex.mockResolvedValue(undefined);

    expect(await isL1ToL2MessageReady(node, messageHash)).toBe(false);
    expect(node.getBlockData).not.toHaveBeenCalled();
  });

  describe('latest fallback (no chain tip)', () => {
    beforeEach(() => {
      node.getL1ToL2MessageIndex.mockResolvedValue(5n);
    });

    it('returns true once the latest block has consumed the message leaf', async () => {
      node.getBlockData.mockResolvedValue(blockWithMessageLeaves(6));

      expect(await isL1ToL2MessageReady(node, messageHash)).toBe(true);
      expect(node.getBlockData).toHaveBeenCalledWith('latest');
    });

    it('returns false when the latest block stops exactly at the message leaf', async () => {
      node.getBlockData.mockResolvedValue(blockWithMessageLeaves(5));

      expect(await isL1ToL2MessageReady(node, messageHash)).toBe(false);
    });

    it('returns false when the latest block is behind the message leaf', async () => {
      node.getBlockData.mockResolvedValue(blockWithMessageLeaves(4));

      expect(await isL1ToL2MessageReady(node, messageHash)).toBe(false);
    });

    it('returns false when there is no block', async () => {
      node.getBlockData.mockResolvedValue(undefined);

      expect(await isL1ToL2MessageReady(node, messageHash)).toBe(false);
    });
  });

  describe('with an explicit chain tip', () => {
    beforeEach(() => {
      node.getL1ToL2MessageIndex.mockResolvedValue(5n);
    });

    it('compares against the requested tip instead of latest', async () => {
      // The proven tip lags behind latest: latest consumed the message leaf, proven has not.
      node.getBlockData.mockImplementation(param =>
        Promise.resolve(param === 'proven' ? blockWithMessageLeaves(5) : blockWithMessageLeaves(7)),
      );

      expect(await isL1ToL2MessageReady(node, messageHash, 'latest')).toBe(true);
      expect(await isL1ToL2MessageReady(node, messageHash, 'proven')).toBe(false);
      expect(node.getBlockData).toHaveBeenLastCalledWith('proven');
    });

    it('returns true once the requested tip has consumed the message leaf', async () => {
      node.getBlockData.mockImplementation(param =>
        Promise.resolve(param === 'proven' ? blockWithMessageLeaves(6) : blockWithMessageLeaves(8)),
      );

      expect(await isL1ToL2MessageReady(node, messageHash, 'proven')).toBe(true);
    });
  });
});
