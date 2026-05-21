import { Buffer } from 'buffer';
import {
  MAXIMUM_KEY as UPSTREAM_MAXIMUM_KEY,
  fromBufferKey as upstreamFromBufferKey,
  toBufferKey as upstreamToBufferKey,
} from 'ordered-binary';
import { describe, expect, it } from 'vitest';

import { MAXIMUM_KEY, fromBufferKey, toBufferKey } from './ordered-binary-browser.js';

const fixtures: unknown[] = [
  0,
  1,
  -1,
  42,
  -42,
  1.5,
  -1.5,
  Number.MAX_SAFE_INTEGER,
  Number.MIN_SAFE_INTEGER,
  '',
  'a',
  'hello',
  'éèê',
  '中文',
  new Uint8Array([1, 2, 3]),
  true,
  false,
  null,
  ['a', 1],
  [42, 'b', null],
];

describe('ordered-binary-browser parity', () => {
  for (const f of fixtures) {
    it(`toBufferKey matches upstream for ${JSON.stringify(f)}`, () => {
      const ours = toBufferKey(f as never);
      const theirs = upstreamToBufferKey(f as never);
      expect(Buffer.compare(Buffer.from(ours), Buffer.from(theirs))).toBe(0);
    });

    it(`roundtrips ${JSON.stringify(f)} through our impl`, () => {
      const encoded = toBufferKey(f as never);
      const decoded = fromBufferKey(encoded);
      const upstreamDecoded = upstreamFromBufferKey(upstreamToBufferKey(f as never));
      expect(JSON.stringify(decoded)).toBe(JSON.stringify(upstreamDecoded));
    });
  }

  it('exposes MAXIMUM_KEY equal to upstream', () => {
    expect(Buffer.compare(Buffer.from(MAXIMUM_KEY), Buffer.from(UPSTREAM_MAXIMUM_KEY))).toBe(0);
  });
});
