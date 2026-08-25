import { Fr } from '@aztec/foundation/curves/bn254';

import { bucketStartsOf, bundleLength, flattenBundle } from './inbox_message_bundle.js';
import { accumulateInboxRollingHash, updateInboxRollingHash } from './inbox_rolling_hash.js';

describe('inbox rolling hash', () => {
  // Shared test vectors, derived independently of the L1, noir and TS implementations by
  // `l1-contracts/scripts/inbox_rolling_hash_vectors.py`. Any divergence here means the three rolling hashes would
  // disagree.
  const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => new Fr(from + i));

  it('chains a single leaf from zero', () => {
    expect(accumulateInboxRollingHash(Fr.ZERO, [[new Fr(11)]])).toEqual(
      Fr.fromHexString('0x00551b59fed79dcce036e55050cf38ef367abfec03557e234866ac023879b245'),
    );
  });

  it('chains three leaves in one bucket from zero', () => {
    expect(accumulateInboxRollingHash(Fr.ZERO, [[new Fr(11), new Fr(22), new Fr(33)]])).toEqual(
      Fr.fromHexString('0x00e6cba8a055d279f8568edc4d0969a107fcda0c48347afdfd3dfeb053aa22c7'),
    );
  });

  it('chains 256 leaves in one bucket from zero', () => {
    expect(accumulateInboxRollingHash(Fr.ZERO, [range(1, 256)])).toEqual(
      Fr.fromHexString('0x009ff152cad9525e1c092ae6d4fb390149de5599eac09b76b0ebd1c6e26bb504'),
    );
  });

  it('chains from a non-zero start', () => {
    expect(accumulateInboxRollingHash(new Fr(0x2a), [[new Fr(7), new Fr(8)]])).toEqual(
      Fr.fromHexString('0x00d84d0b60599b1c7380a723d84310d40efaa4f5673dd62e0af41b03bc9a07a6'),
    );
  });

  it('is continuous across segments', () => {
    const start = new Fr(0x2a);
    const mid = updateInboxRollingHash(start, new Fr(7), true);
    expect(mid).toEqual(Fr.fromHexString('0x00f13cb848052a7ab6f1de788a5979f5a5caa8c11cf176715d63481618e3b575'));
    // Continuing the same bucket in a second segment matches chaining both leaves at once.
    expect(updateInboxRollingHash(mid, new Fr(8), false)).toEqual(
      accumulateInboxRollingHash(start, [[new Fr(7), new Fr(8)]]),
    );
  });

  it('commits to the bucket boundaries', () => {
    const leaves = [new Fr(11), new Fr(22), new Fr(33), new Fr(44)];
    const oneBucket = accumulateInboxRollingHash(Fr.ZERO, [leaves]);
    const twoBuckets = accumulateInboxRollingHash(Fr.ZERO, [leaves.slice(0, 2), leaves.slice(2)]);

    expect(oneBucket).toEqual(Fr.fromHexString('0x00e37b7cc5526ab379c54209bc1c6a4ba2c457d024330281b97a533561701551'));
    expect(twoBuckets).toEqual(Fr.fromHexString('0x00fa0346e7c4ee1bdf29a48af28182fdc236e2936e4d0c2e951dbd4b9b6464fc'));
    expect(oneBucket).not.toEqual(twoBuckets);
  });

  it('returns the start unchanged for an empty bundle', () => {
    const start = new Fr(0x2a);
    expect(accumulateInboxRollingHash(start, [])).toEqual(start);
  });
});

describe('inbox message bundle', () => {
  const bundle = [[new Fr(11), new Fr(22)], [new Fr(33)]];

  it('flattens the buckets in insertion order', () => {
    expect(flattenBundle(bundle)).toEqual([new Fr(11), new Fr(22), new Fr(33)]);
    expect(bundleLength(bundle)).toBe(3);
  });

  it('flags the first leaf of every bucket', () => {
    expect(bucketStartsOf(bundle)).toEqual([true, false, true]);
  });

  it('rejects an empty bucket', () => {
    expect(() => bucketStartsOf([[new Fr(11)], []])).toThrow('empty bucket at index 1');
  });
});
