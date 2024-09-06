import { type MockProxy, mock, mockFn } from 'jest-mock-extended';
import { type PublicClient } from 'viem';

import { batchedRead } from './data_retrieval.js';

describe('data_retrieval', () => {
  let client: MockProxy<PublicClient>;
  beforeEach(() => {
    client = mock<PublicClient>({
      getBlockNumber: mockFn().mockReturnValue(100n),
    });
  });
  describe('batchedRead', () => {
    it.each([
      [1n, 10n, [[1n, 10n]], 10n],
      [
        1n,
        19n,
        [
          [1n, 11n],
          [12n, 19n],
        ],
        19n,
      ],
      [
        72n,
        undefined,
        [
          [72n, 82n],
          [83n, 93n],
          [94n, 100n],
        ],
        100n,
      ],
    ])('reads between %s and %s', async (startBlock, endBlock, expectedRanges, expectedReadUpTo) => {
      const { retrievedData, lastProcessedL1BlockNumber } = await batchedRead(
        client,
        startBlock,
        endBlock,
        10n,
        (_client, startBlock, endBlock) => {
          return Promise.resolve([[startBlock, endBlock]]);
        },
      );

      expect(retrievedData).toEqual(expectedRanges);
      expect(lastProcessedL1BlockNumber).toBe(expectedReadUpTo);
    });
  });
});
