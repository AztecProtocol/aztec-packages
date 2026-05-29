import type { WithOrigin } from './origin.js';
import { filterCanonical } from './origin_read.js';

describe('filterCanonical', () => {
  // A fake canonicality authority: only the hash '0xgood' is canonical.
  const chain = {
    isCanonical: (origin: { blockHash: string }) => Promise.resolve(origin.blockHash === '0xgood'),
  };

  it('keeps canonical rows and drops the rest, preserving order', async () => {
    const rows: WithOrigin<{ id: number }>[] = [
      { id: 1, origin: { blockNumber: 10, blockHash: '0xgood' } },
      { id: 2, origin: { blockNumber: 11, blockHash: '0xstale' } },
      { id: 3, origin: { blockNumber: 12, blockHash: '0xgood' } },
    ];
    const result = await filterCanonical(chain, rows);
    expect(result.map(r => r.id)).toEqual([1, 3]);
  });

  it('returns an empty array when nothing is canonical', async () => {
    const rows: WithOrigin<{ id: number }>[] = [{ id: 1, origin: { blockNumber: 10, blockHash: '0xstale' } }];
    await expect(filterCanonical(chain, rows)).resolves.toEqual([]);
  });
});
