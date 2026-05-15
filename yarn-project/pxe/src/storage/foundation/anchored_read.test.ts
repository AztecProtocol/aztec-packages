import { type Anchored } from './anchor.js';
import { filterCanonical } from './anchored_read.js';

describe('filterCanonical', () => {
  // A fake canonicality authority: only the hash '0xgood' is canonical.
  const chain = {
    isCanonical: (anchor: { blockHash: string }) => Promise.resolve(anchor.blockHash === '0xgood'),
  };

  it('keeps canonical rows and drops the rest, preserving order', async () => {
    const rows: Anchored<{ id: number }>[] = [
      { id: 1, anchor: { blockNumber: 10, blockHash: '0xgood' } },
      { id: 2, anchor: { blockNumber: 11, blockHash: '0xstale' } },
      { id: 3, anchor: { blockNumber: 12, blockHash: '0xgood' } },
    ];
    const result = await filterCanonical(chain, rows);
    expect(result.map(r => r.id)).toEqual([1, 3]);
  });

  it('returns an empty array when nothing is canonical', async () => {
    const rows: Anchored<{ id: number }>[] = [{ id: 1, anchor: { blockNumber: 10, blockHash: '0xstale' } }];
    await expect(filterCanonical(chain, rows)).resolves.toEqual([]);
  });
});
