import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import { Tx } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import type { ISharedTxValidationCache } from './shared_tx_validation_cache.js';
import { NodeRpcTxSource } from './tx_source.js';

describe('NodeRpcTxSource', () => {
  let mockClient: MockProxy<Pick<AztecNode, 'getTxsByHash'>>;
  let mockValidationCache: MockProxy<ISharedTxValidationCache>;

  const makeTx = async () => {
    const tx = Tx.random();
    await tx.recomputeHash();
    return tx;
  };

  beforeEach(() => {
    mockClient = mock<Pick<AztecNode, 'getTxsByHash'>>();
    mockValidationCache = mock<ISharedTxValidationCache>();
  });

  const createSource = () => new NodeRpcTxSource(mockClient, mockValidationCache, 'test');

  it('returns valid txs when validation cache accepts', async () => {
    const tx1 = await makeTx();
    const tx2 = await makeTx();
    mockClient.getTxsByHash.mockResolvedValue([tx1, tx2]);
    mockValidationCache.submitBatch.mockResolvedValue([{ status: 'accepted' }, { status: 'accepted' }]);

    const result = await createSource().getTxsByHash([tx1.getTxHash(), tx2.getTxHash()]);

    expect(result.validTxs).toEqual([tx1, tx2]);
    expect(result.invalidTxHashes).toHaveLength(0);
  });

  it('treats skipped outcomes as valid', async () => {
    const tx1 = await makeTx();
    const tx2 = await makeTx();
    mockClient.getTxsByHash.mockResolvedValue([tx1, tx2]);
    mockValidationCache.submitBatch.mockResolvedValue([{ status: 'accepted' }, { status: 'skipped' }]);

    const result = await createSource().getTxsByHash([tx1.getTxHash(), tx2.getTxHash()]);

    expect(result.validTxs).toEqual([tx1, tx2]);
    expect(result.invalidTxHashes).toHaveLength(0);
  });

  it('returns invalid tx hashes when validation cache rejects', async () => {
    const tx1 = await makeTx();
    const tx2 = await makeTx();
    mockClient.getTxsByHash.mockResolvedValue([tx1, tx2]);
    mockValidationCache.submitBatch.mockResolvedValue([
      { status: 'invalid', reason: ['bad'] },
      { status: 'invalid', reason: ['bad'] },
    ]);

    const result = await createSource().getTxsByHash([tx1.getTxHash(), tx2.getTxHash()]);

    expect(result.validTxs).toHaveLength(0);
    expect(result.invalidTxHashes).toEqual([tx1.getTxHash().toString(), tx2.getTxHash().toString()]);
  });

  it('partitions txs based on validation cache outcomes', async () => {
    const tx1 = await makeTx();
    const tx2 = await makeTx();
    mockClient.getTxsByHash.mockResolvedValue([tx1, tx2]);
    mockValidationCache.submitBatch.mockResolvedValue([{ status: 'accepted' }, { status: 'invalid', reason: ['bad'] }]);

    const result = await createSource().getTxsByHash([tx1.getTxHash(), tx2.getTxHash()]);

    expect(result.validTxs).toEqual([tx1]);
    expect(result.invalidTxHashes).toEqual([tx2.getTxHash().toString()]);
  });
});
