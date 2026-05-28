import { type Logger, createLogger } from '@aztec/foundation/log';
import type { PrivateKernelTailCircuitPublicInputs } from '@aztec/stdlib/kernel';
import { type AppTaggingSecret, PrivateLog, SiloedTag } from '@aztec/stdlib/logs';
import { randomAppTaggingSecret } from '@aztec/stdlib/testing';
import { TxHash } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import type { SenderTaggingStore } from '../storage/tagging_store/sender_tagging_store.js';
import { persistSenderTaggingIndexRangesForTx } from './persist_sender_tagging_index_ranges.js';

describe('persistSenderTaggingIndexRangesForTx', () => {
  let secret: AppTaggingSecret;
  let store: MockProxy<SenderTaggingStore>;
  let publicInputs: MockProxy<PrivateKernelTailCircuitPublicInputs>;
  let log: Logger;
  let txHash: TxHash;
  let getTxHash: jest.Mock<() => Promise<TxHash>>;

  beforeAll(async () => {
    secret = await randomAppTaggingSecret();
    log = createLogger('test:persist-sender-tagging-index-ranges');
  });

  beforeEach(() => {
    store = mock<SenderTaggingStore>();
    publicInputs = mock<PrivateKernelTailCircuitPublicInputs>();
    txHash = TxHash.random();
    getTxHash = jest.fn<() => Promise<TxHash>>().mockResolvedValue(txHash);
  });

  /** Builds a `PrivateLog` whose first field is the siloed tag for `(secret, index)`. */
  async function survivingLogForIndex(index: number): Promise<PrivateLog> {
    const tag = await SiloedTag.compute({ extendedSecret: secret, index });
    return PrivateLog.fromBlobFields(1, [tag.value]);
  }

  it('does nothing when no recorded ranges are provided', async () => {
    publicInputs.getNonEmptyPrivateLogs.mockReturnValue([]);

    await persistSenderTaggingIndexRangesForTx(store, [], publicInputs, getTxHash, 'test', log);

    expect(store.storePendingIndexes).not.toHaveBeenCalled();
    expect(getTxHash).not.toHaveBeenCalled();
  });

  it('does nothing when every recorded index was squashed', async () => {
    publicInputs.getNonEmptyPrivateLogs.mockReturnValue([]);

    await persistSenderTaggingIndexRangesForTx(
      store,
      [{ extendedSecret: secret, lowestIndex: 1, highestIndex: 3 }],
      publicInputs,
      getTxHash,
      'test',
      log,
    );

    expect(store.storePendingIndexes).not.toHaveBeenCalled();
    expect(getTxHash).not.toHaveBeenCalled();
  });

  it('persists recorded ranges unchanged when every index survives', async () => {
    publicInputs.getNonEmptyPrivateLogs.mockReturnValue([
      await survivingLogForIndex(1),
      await survivingLogForIndex(2),
      await survivingLogForIndex(3),
    ]);

    await persistSenderTaggingIndexRangesForTx(
      store,
      [{ extendedSecret: secret, lowestIndex: 1, highestIndex: 3 }],
      publicInputs,
      getTxHash,
      'test',
      log,
    );

    expect(store.storePendingIndexes).toHaveBeenCalledWith(
      [{ extendedSecret: secret, lowestIndex: 1, highestIndex: 3 }],
      txHash,
      'test',
    );
    expect(getTxHash).toHaveBeenCalledTimes(1);
  });

  it('persists shrunk ranges when some indexes were squashed', async () => {
    // Recorded range [1, 5], but only indexes 2 and 4 survived squashing.
    publicInputs.getNonEmptyPrivateLogs.mockReturnValue([await survivingLogForIndex(2), await survivingLogForIndex(4)]);

    await persistSenderTaggingIndexRangesForTx(
      store,
      [{ extendedSecret: secret, lowestIndex: 1, highestIndex: 5 }],
      publicInputs,
      getTxHash,
      'test',
      log,
    );

    expect(store.storePendingIndexes).toHaveBeenCalledWith(
      [{ extendedSecret: secret, lowestIndex: 2, highestIndex: 4 }],
      txHash,
      'test',
    );
  });
});
