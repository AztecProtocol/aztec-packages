import { Fr } from '@aztec/foundation/curves/bn254';

import {
  type InboxMessageBundle,
  InboxMessageBundleSchema,
  bucketStartsOf,
  bucketTimestampsOf,
  bundleLength,
  flattenBundle,
  sliceBundle,
} from './inbox_message_bundle.js';
import { accumulateInboxRollingHash, updateInboxRollingHash } from './inbox_rolling_hash.js';

describe('inbox rolling hash', () => {
  // Shared test vectors, derived independently of the L1, noir and TS implementations by
  // `l1-contracts/scripts/inbox_rolling_hash_vectors.py`. Any divergence here means the three rolling hashes would
  // disagree.
  const ts = 1000n;
  const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => new Fr(from + i));
  const bucket = (timestamp: bigint, leaves: Fr[]) => ({ timestamp, leaves });

  it('chains a single leaf from zero', () => {
    expect(accumulateInboxRollingHash(Fr.ZERO, [bucket(ts, [new Fr(11)])])).toEqual(
      Fr.fromHexString('0x00a547352c19bddb35bcc0ce9a278ada5344922ba4e0c85463f2150ba5de7064'),
    );
  });

  it('chains three leaves in one bucket from zero', () => {
    expect(accumulateInboxRollingHash(Fr.ZERO, [bucket(ts, [new Fr(11), new Fr(22), new Fr(33)])])).toEqual(
      Fr.fromHexString('0x00e767ae30130bf27ed2ece5f6685d6d93d835eca2750e5c3d51aa622ba65ae1'),
    );
  });

  it('chains 256 leaves in one bucket from zero', () => {
    expect(accumulateInboxRollingHash(Fr.ZERO, [bucket(ts, range(1, 256))])).toEqual(
      Fr.fromHexString('0x004360c26448f4003eb2d256b8561a671d419abc720f2e2366210afe6b50c5e0'),
    );
  });

  it('chains from a non-zero start', () => {
    expect(accumulateInboxRollingHash(new Fr(0x2a), [bucket(ts, [new Fr(7), new Fr(8)])])).toEqual(
      Fr.fromHexString('0x00b1e0bf8cec0ee768fb5fad71cbc3f84e5298fdc77b4680d821165433944437'),
    );
  });

  it('is continuous across segments', () => {
    const start = new Fr(0x2a);
    const mid = updateInboxRollingHash(start, new Fr(7), true, ts);
    expect(mid).toEqual(Fr.fromHexString('0x0031fe0f1cb02f3ca761ac9340fdfbfde3ae8bd082e7115b9a3f467b38d23869'));
    // Continuing the same bucket in a second segment matches chaining both leaves at once.
    expect(updateInboxRollingHash(mid, new Fr(8), false, ts)).toEqual(
      accumulateInboxRollingHash(start, [bucket(ts, [new Fr(7), new Fr(8)])]),
    );
  });

  it('commits to the bucket boundaries', () => {
    const leaves = [new Fr(11), new Fr(22), new Fr(33), new Fr(44)];
    const oneBucket = accumulateInboxRollingHash(Fr.ZERO, [bucket(ts, leaves)]);
    // The two buckets are rollover siblings: same L1 block, so the same timestamp.
    const twoBuckets = accumulateInboxRollingHash(Fr.ZERO, [
      bucket(ts, leaves.slice(0, 2)),
      bucket(ts, leaves.slice(2)),
    ]);

    expect(oneBucket).toEqual(Fr.fromHexString('0x003a0be72baad115a70b7b945d4b9df5a097f85f5bd545a3148828bd85a71f0b'));
    expect(twoBuckets).toEqual(Fr.fromHexString('0x006449486fd6561793f12c478f5f5401fa3b1d083206a5d6982635c1b9caee48'));
    expect(oneBucket).not.toEqual(twoBuckets);
  });

  it('commits to the bucket timestamps', () => {
    const leaves = [new Fr(11), new Fr(22), new Fr(33), new Fr(44)];
    const sameTime = accumulateInboxRollingHash(Fr.ZERO, [bucket(ts, leaves.slice(0, 2)), bucket(ts, leaves.slice(2))]);
    const retimed = accumulateInboxRollingHash(Fr.ZERO, [
      bucket(ts, leaves.slice(0, 2)),
      bucket(ts + 1n, leaves.slice(2)),
    ]);

    expect(retimed).toEqual(Fr.fromHexString('0x00cb36ebc4a3b5cf0adfda4a42c0011deae1d407fa3191acece69dacdd16594b'));
    expect(retimed).not.toEqual(sameTime);
  });

  it('absorbs the whole uint64 timestamp range', () => {
    expect(accumulateInboxRollingHash(Fr.ZERO, [bucket(0n, [new Fr(11)])])).toEqual(
      Fr.fromHexString('0x00277b3c9e3871988dcb2ad539e4a567db746f01d3e06573a13eafab5dc92eaa'),
    );
    expect(accumulateInboxRollingHash(Fr.ZERO, [bucket(2n ** 64n - 1n, [new Fr(11)])])).toEqual(
      Fr.fromHexString('0x001e0d6e38689a3dbd197f379b6cb95abbe87158852e98e3489b0cb040452dbd'),
    );
  });

  it('rejects a timestamp that does not fit a uint64', () => {
    expect(() => updateInboxRollingHash(Fr.ZERO, new Fr(11), true, 2n ** 64n)).toThrow('does not fit in a uint64');
    expect(() => updateInboxRollingHash(Fr.ZERO, new Fr(11), true, -1n)).toThrow('does not fit in a uint64');
  });

  it('returns the start unchanged for an empty bundle', () => {
    const start = new Fr(0x2a);
    expect(accumulateInboxRollingHash(start, [])).toEqual(start);
  });
});

describe('inbox message bundle', () => {
  const bundle: InboxMessageBundle = [
    { timestamp: 100n, leaves: [new Fr(11), new Fr(22)] },
    { timestamp: 112n, leaves: [new Fr(33)] },
  ];

  it('flattens the buckets in insertion order', () => {
    expect(flattenBundle(bundle)).toEqual([new Fr(11), new Fr(22), new Fr(33)]);
    expect(bundleLength(bundle)).toBe(3);
  });

  it('flags the first leaf of every bucket', () => {
    expect(bucketStartsOf(bundle)).toEqual([true, false, true]);
  });

  it('expands the bucket timestamps per leaf', () => {
    expect(bucketTimestampsOf(bundle)).toEqual([100n, 100n, 112n]);
  });

  it('rejects an empty bucket', () => {
    expect(() =>
      bucketStartsOf([
        { timestamp: 100n, leaves: [new Fr(11)] },
        { timestamp: 112n, leaves: [] },
      ]),
    ).toThrow('empty bucket at index 1');
    expect(() =>
      bucketTimestampsOf([
        { timestamp: 100n, leaves: [new Fr(11)] },
        { timestamp: 112n, leaves: [] },
      ]),
    ).toThrow('empty bucket at index 1');
  });

  it('slices whole buckets out of a bundle', () => {
    expect(sliceBundle(bundle, 0, 2)).toEqual([bundle[0]]);
    expect(sliceBundle(bundle, 2, 3)).toEqual([bundle[1]]);
    expect(sliceBundle(bundle, 0, 3)).toEqual(bundle);
    expect(sliceBundle(bundle, 2, 2)).toEqual([]);
  });

  it('refuses to slice through a bucket', () => {
    expect(() => sliceBundle(bundle, 0, 1)).toThrow('cuts the bucket at leaves [0, 2)');
    expect(() => sliceBundle(bundle, 1, 3)).toThrow('cuts the bucket at leaves [0, 2)');
  });

  it('clamps boundaries outside the bundle', () => {
    expect(sliceBundle(bundle, 0, 9)).toEqual(bundle);
    expect(sliceBundle(bundle, 2, 1)).toEqual([]);
    expect(sliceBundle([], 3, 7)).toEqual([]);
  });

  it('only accepts uint64 bucket timestamps over the wire', () => {
    const parse = (timestamp: string) => InboxMessageBundleSchema.safeParse([{ timestamp, leaves: ['0x01'] }]).success;
    expect(parse('0')).toBe(true);
    expect(parse((2n ** 64n - 1n).toString())).toBe(true);
    expect(parse('-1')).toBe(false);
    expect(parse((2n ** 64n).toString())).toBe(false);
  });
});
