import type { CanonicalityCheck } from './canonicality_check.js';
import { filterCanonical } from './canonicality_check.js';
import { withOrigin } from './origin.js';

describe('filterCanonical', () => {
  const canonical = new Set<string>();
  const check: CanonicalityCheck = {
    isCanonical: o => canonical.has(`${o.blockNumber}:${o.blockHash}`),
  };

  beforeEach(() => canonical.clear());

  it('keeps rows whose origin is canonical and drops the rest, preserving order', () => {
    const rows = [
      withOrigin({ id: 'a' }, { blockNumber: 1, blockHash: '0x1' }),
      withOrigin({ id: 'b' }, { blockNumber: 2, blockHash: '0x2' }),
      withOrigin({ id: 'c' }, { blockNumber: 3, blockHash: '0x3' }),
    ];
    canonical.add('1:0x1');
    canonical.add('3:0x3');

    expect(filterCanonical(check, rows).map(r => r.id)).toEqual(['a', 'c']);
  });

  it('returns an empty array when nothing is canonical', () => {
    const rows = [withOrigin({ id: 'a' }, { blockNumber: 1, blockHash: '0x1' })];
    expect(filterCanonical(check, rows)).toEqual([]);
  });
});
