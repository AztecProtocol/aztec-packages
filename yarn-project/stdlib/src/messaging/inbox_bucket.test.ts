import { Buffer32 } from '@aztec/foundation/buffer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { jsonParseWithSchema, jsonStringify } from '@aztec/foundation/json-rpc';

import type { InboxBucket } from './inbox_bucket.js';
import { InboxBucketSchema } from './inbox_bucket.js';

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
