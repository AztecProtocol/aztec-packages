import { MAX_INCLUDE_BY_TIMESTAMP_DURATION } from '@aztec/constants';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import { DirectionalAppTaggingSecret, SiloedTag, Tag } from '@aztec/stdlib/logs';
import { makeBlockHeader, randomTxScopedPrivateL2Log } from '@aztec/stdlib/testing';

import { type MockProxy, mock } from 'jest-mock-extended';

import { RecipientTaggingDataProvider } from '../../storage/tagging_data_provider/recipient_tagging_data_provider.js';
import { UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN } from '../index.js';
import { loadPrivateLogsForSenderRecipientPair } from './load_private_logs_for_sender_recipient_pair.js';

// In this test suite we don't care about the anchor block behavior as that is sufficiently tested by
// the loadLogsForRange test suite, so we use a high block number to ensure it occurs after all logs.
const NON_INTERFERING_ANCHOR_BLOCK_NUMBER = BlockNumber(100);

describe('loadPrivateLogsForSenderRecipientPair', () => {
  let secret: DirectionalAppTaggingSecret;
  let app: AztecAddress;

  let aztecNode: MockProxy<AztecNode>;
  let taggingDataProvider: RecipientTaggingDataProvider;

  const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));

  async function computeSiloedTagForIndex(index: number) {
    const tag = await Tag.compute({ secret, index });
    return SiloedTag.compute(tag, app);
  }

  function makeLog(blockNumber: number, blockTimestamp: bigint, tag: Fr) {
    return randomTxScopedPrivateL2Log({ blockNumber, blockTimestamp, tag });
  }

  beforeAll(async () => {
    secret = DirectionalAppTaggingSecret.fromString(Fr.random().toString());
    app = await AztecAddress.random();
    aztecNode = mock<AztecNode>();
  });

  beforeEach(async () => {
    aztecNode.getPrivateLogsByTags.mockReset();
    aztecNode.getL2Tips.mockReset();
    aztecNode.getBlockHeader.mockReset();
    taggingDataProvider = new RecipientTaggingDataProvider(await openTmpStore('test'));
  });

  it('returns empty array when no logs found', async () => {
    aztecNode.getL2Tips.mockResolvedValue({
      finalized: { number: BlockNumber(10) },
    } as any);

    aztecNode.getBlockHeader.mockResolvedValue(makeBlockHeader(0, { timestamp: currentTimestamp }));

    // no logs found for any tag
    aztecNode.getPrivateLogsByTags.mockImplementation((tags: SiloedTag[]) => {
      return Promise.resolve(tags.map((_tag: SiloedTag) => []));
    });

    const logs = await loadPrivateLogsForSenderRecipientPair(
      secret,
      app,
      aztecNode,
      taggingDataProvider,
      NON_INTERFERING_ANCHOR_BLOCK_NUMBER,
    );

    expect(logs).toHaveLength(0);
    expect(await taggingDataProvider.getHighestAgedIndex(secret)).toBeUndefined();
    expect(await taggingDataProvider.getHighestFinalizedIndex(secret)).toBeUndefined();
  });

  it('loads log and updates highest finalized index but not highest aged index', async () => {
    const finalizedBlockNumber = 10;

    const logBlockTimestamp = currentTimestamp - 5000n; // not aged
    const logIndex = 5;
    const logTag = await computeSiloedTagForIndex(logIndex);

    aztecNode.getL2Tips.mockResolvedValue({
      finalized: { number: BlockNumber(finalizedBlockNumber) },
    } as any);

    aztecNode.getBlockHeader.mockResolvedValue(makeBlockHeader(0, { timestamp: currentTimestamp }));

    // The log is finalized
    aztecNode.getPrivateLogsByTags.mockImplementation((tags: SiloedTag[]) => {
      return Promise.resolve(
        tags.map((t: SiloedTag) =>
          t.equals(logTag) ? [makeLog(finalizedBlockNumber, logBlockTimestamp, logTag.value)] : [],
        ),
      );
    });

    const logs = await loadPrivateLogsForSenderRecipientPair(
      secret,
      app,
      aztecNode,
      taggingDataProvider,
      NON_INTERFERING_ANCHOR_BLOCK_NUMBER,
    );

    expect(logs).toHaveLength(1);
    expect(await taggingDataProvider.getHighestFinalizedIndex(secret)).toBe(logIndex);
    expect(await taggingDataProvider.getHighestAgedIndex(secret)).toBeUndefined();
  });

  it('loads log and updates both highest aged and highest finalized indexes', async () => {
    const finalizedBlockNumber = 10;

    const logBlockTimestamp = currentTimestamp - BigInt(MAX_INCLUDE_BY_TIMESTAMP_DURATION) - 1000n; // aged
    const logIndex = 7;
    const logTag = await computeSiloedTagForIndex(logIndex);

    aztecNode.getL2Tips.mockResolvedValue({
      finalized: { number: BlockNumber(finalizedBlockNumber) },
    } as any);

    aztecNode.getBlockHeader.mockResolvedValue(makeBlockHeader(0, { timestamp: currentTimestamp }));

    // The log is finalized
    aztecNode.getPrivateLogsByTags.mockImplementation((tags: SiloedTag[]) => {
      return Promise.resolve(
        tags.map((t: SiloedTag) =>
          t.equals(logTag) ? [makeLog(finalizedBlockNumber, logBlockTimestamp, logTag.value)] : [],
        ),
      );
    });

    const logs = await loadPrivateLogsForSenderRecipientPair(
      secret,
      app,
      aztecNode,
      taggingDataProvider,
      NON_INTERFERING_ANCHOR_BLOCK_NUMBER,
    );

    expect(logs).toHaveLength(1);
    expect(await taggingDataProvider.getHighestAgedIndex(secret)).toBe(logIndex);
    expect(await taggingDataProvider.getHighestFinalizedIndex(secret)).toBe(logIndex);
  });

  it('logs at boundaries are properly loaded, window and highest indexes advance as expected', async () => {
    const finalizedBlockNumber = 10;

    const log1BlockTimestamp = currentTimestamp - BigInt(MAX_INCLUDE_BY_TIMESTAMP_DURATION) - 1000n; // Aged
    const log2BlockTimestamp = currentTimestamp - 5000n; // Not aged
    const highestAgedIndex = 3;
    const highestFinalizedIndex = 5;
    const log1Index = highestAgedIndex + 1; // At the beginning of the range
    const log2Index = highestFinalizedIndex + UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN; // At the window boundary
    const log1Tag = await computeSiloedTagForIndex(log1Index);
    const log2Tag = await computeSiloedTagForIndex(log2Index);

    // Set existing highest aged index and highest finalized index
    await taggingDataProvider.updateHighestAgedIndex(secret, highestAgedIndex);
    await taggingDataProvider.updateHighestFinalizedIndex(secret, highestFinalizedIndex);

    aztecNode.getL2Tips.mockResolvedValue({
      finalized: { number: BlockNumber(finalizedBlockNumber) },
    } as any);

    aztecNode.getBlockHeader.mockResolvedValue(makeBlockHeader(0, { timestamp: currentTimestamp }));

    // We record the number of queried tags to be able to verify that the window was moved forward correctly.
    let numQueriedTags = 0;

    aztecNode.getPrivateLogsByTags.mockImplementation((tags: SiloedTag[]) => {
      numQueriedTags += tags.length;
      return Promise.resolve(
        tags.map((t: SiloedTag) => {
          if (t.equals(log1Tag)) {
            return [makeLog(finalizedBlockNumber, log1BlockTimestamp, log1Tag.value)];
          } else if (t.equals(log2Tag)) {
            return [makeLog(finalizedBlockNumber, log2BlockTimestamp, log2Tag.value)];
          }
          return [];
        }),
      );
    });

    const logs = await loadPrivateLogsForSenderRecipientPair(
      secret,
      app,
      aztecNode,
      taggingDataProvider,
      NON_INTERFERING_ANCHOR_BLOCK_NUMBER,
    );

    // Verify that both logs at the boundaries of the range were found and processed
    expect(logs).toHaveLength(2);
    expect(await taggingDataProvider.getHighestFinalizedIndex(secret)).toBe(log2Index);
    expect(await taggingDataProvider.getHighestAgedIndex(secret)).toBe(log1Index);

    // Verify that the window was moved forward correctly
    // Total range queried: from (highestAgedIndex + 1) to (log2Index + WINDOW_LEN + 1) exclusive
    const expectedNumQueriedTags = log2Index + UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN - highestAgedIndex;
    expect(numQueriedTags).toBe(expectedNumQueriedTags);
  });
});
