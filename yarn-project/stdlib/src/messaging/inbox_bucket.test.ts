import { Buffer32 } from '@aztec/foundation/buffer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { jsonParseWithSchema, jsonStringify } from '@aztec/foundation/json-rpc';

import type { InboxBucket } from './inbox_bucket.js';
import { InboxBucketRef, InboxBucketSchema } from './inbox_bucket.js';

const makeBucket = (overrides: Partial<InboxBucket> = {}): InboxBucket => ({
  seq: 12n,
  inboxRollingHash: new Fr(0xabcn),
  totalMsgCount: 30n,
  timestamp: 1_650_000_000n,
  msgCount: 3,
  lastMessageIndex: 29n,
  l1BlockNumber: 4_200n,
  l1BlockHash: Buffer32.fromBigInt(4_200n),
  ...overrides,
});

describe('InboxBucket', () => {
  it('round-trips through its zod schema', () => {
    const bucket = makeBucket();
    expect(jsonParseWithSchema(jsonStringify(bucket), InboxBucketSchema)).toEqual(bucket);
  });
});

describe('InboxBucketRef', () => {
  it('serializes and deserializes round-trip', () => {
    const ref = new InboxBucketRef(42n, 1_700_000_000n, Fr.random());
    const deserialized = InboxBucketRef.fromBuffer(ref.toBuffer());
    expect(deserialized).toEqual(ref);
    expect(deserialized.equals(ref)).toBe(true);
  });

  it('serializes to the fixed advertised size', () => {
    const ref = InboxBucketRef.random();
    expect(ref.toBuffer().length).toBe(InboxBucketRef.SIZE);
    expect(ref.getSize()).toBe(InboxBucketRef.SIZE);
  });

  it('equals distinguishes each component', () => {
    const ref = new InboxBucketRef(7n, 100n, new Fr(9n));
    expect(ref.equals(new InboxBucketRef(8n, 100n, new Fr(9n)))).toBe(false);
    expect(ref.equals(new InboxBucketRef(7n, 101n, new Fr(9n)))).toBe(false);
    expect(ref.equals(new InboxBucketRef(7n, 100n, new Fr(10n)))).toBe(false);
    expect(ref.equals(new InboxBucketRef(7n, 100n, new Fr(9n)))).toBe(true);
  });

  it('derives from a bucket snapshot', () => {
    const bucket = makeBucket();
    const ref = InboxBucketRef.fromBucket(bucket);
    expect(ref.bucketSeq).toBe(bucket.seq);
    expect(ref.bucketTimestamp).toBe(bucket.timestamp);
    expect(ref.inboxRollingHash).toEqual(bucket.inboxRollingHash);
  });

  it('round-trips through its zod schema', () => {
    const ref = InboxBucketRef.random();
    const parsed = jsonParseWithSchema(jsonStringify(ref), InboxBucketRef.schema);
    expect(parsed).toEqual(ref);
  });
});
