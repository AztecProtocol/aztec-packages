import { MULTI_CALL_3_ADDRESS } from '@aztec/ethereum/contracts';
import { Fr } from '@aztec/foundation/curves/bn254';

import { type SentInboxMessage, validateL1ToL2MessageBatchBuckets } from './l1_to_l2_seeding.js';

/** Capacity used by these cases. Small on purpose, so a batch can fill several buckets without hundreds of rows. */
const CAPACITY = 4;

/**
 * Builds the `MessageSent` events of a batch absorbed into `bucketSeqs[i]`, and the bucket totals the Inbox would
 * report at that L1 block: every bucket the batch left behind is full, and the last one holds what it accumulated.
 */
function buildBatch(bucketSeqs: bigint[], startingFill = 0) {
  const messages: SentInboxMessage[] = bucketSeqs.map((bucketSeq, index) => ({
    msgHash: new Fr(index + 1).toString(),
    globalLeafIndex: BigInt(index),
    bucketSeq,
    content: new Fr(index + 1).toString(),
    secretHash: new Fr(index + 1).toString(),
    sender: MULTI_CALL_3_ADDRESS,
    recipient: new Fr(1).toString(),
    version: 1n,
  }));

  const bucketTotals = new Map<bigint, number | undefined>();
  for (const [index, bucketSeq] of bucketSeqs.entries()) {
    const previous = bucketTotals.get(bucketSeq) ?? (index === 0 ? startingFill : 0);
    bucketTotals.set(bucketSeq, previous + 1);
  }
  return { messages, bucketTotals };
}

describe('validateL1ToL2MessageBatchBuckets', () => {
  it('accepts a batch that fits in the bucket it opened', () => {
    const { messages, bucketTotals } = buildBatch([7n, 7n, 7n]);

    const verdict = validateL1ToL2MessageBatchBuckets({ messages, bucketTotals, bucketCapacity: CAPACITY });

    expect(verdict.outcome).toEqual('valid');
    expect(verdict.buckets).toEqual([{ seq: 7n, messagesInBatch: 3, totalInBucket: 3 }]);
  });

  it('accepts a batch that rolled over once its bucket filled up', () => {
    const { messages, bucketTotals } = buildBatch([7n, 7n, 7n, 7n, 8n]);

    const verdict = validateL1ToL2MessageBatchBuckets({ messages, bucketTotals, bucketCapacity: CAPACITY });

    expect(verdict.outcome).toEqual('valid');
    expect(verdict.buckets).toEqual([
      { seq: 7n, messagesInBatch: 4, totalInBucket: 4 },
      { seq: 8n, messagesInBatch: 1, totalInBucket: 1 },
    ]);
  });

  it('accepts a rollover that fell early because the batch started in a bucket someone else had filled', () => {
    // Two messages were already in bucket 7, so the batch's own rollover belongs after its second message.
    const { messages, bucketTotals } = buildBatch([7n, 7n, 8n, 8n], 2);

    const verdict = validateL1ToL2MessageBatchBuckets({ messages, bucketTotals, bucketCapacity: CAPACITY });

    expect(verdict.outcome).toEqual('valid');
    expect(verdict.buckets).toEqual([
      { seq: 7n, messagesInBatch: 2, totalInBucket: 4 },
      { seq: 8n, messagesInBatch: 2, totalInBucket: 2 },
    ]);
  });

  it('rejects a rollover out of a bucket that was not full', () => {
    const { messages, bucketTotals } = buildBatch([7n, 7n, 8n]);

    const verdict = validateL1ToL2MessageBatchBuckets({ messages, bucketTotals, bucketCapacity: CAPACITY });

    expect(verdict.outcome).toEqual('invalid');
    expect(verdict).toMatchObject({
      mismatches: [{ kind: 'buckets', detail: expect.stringContaining('bucket 7 rolled over holding 2 of 4') }],
    });
  });

  it('rejects buckets that are not consecutive', () => {
    const { messages, bucketTotals } = buildBatch([7n, 7n, 7n, 7n, 9n]);

    const verdict = validateL1ToL2MessageBatchBuckets({ messages, bucketTotals, bucketCapacity: CAPACITY });

    expect(verdict.outcome).toEqual('invalid');
    expect(verdict).toMatchObject({
      mismatches: [{ kind: 'buckets', detail: expect.stringContaining('bucket 9 does not follow 7') }],
    });
  });

  it('rejects more messages than a bucket can hold reported in one bucket', () => {
    const { messages, bucketTotals } = buildBatch([7n, 7n, 7n, 7n, 7n]);

    const verdict = validateL1ToL2MessageBatchBuckets({ messages, bucketTotals, bucketCapacity: CAPACITY });

    expect(verdict.outcome).toEqual('invalid');
    expect(verdict).toMatchObject({
      mismatches: expect.arrayContaining([
        { kind: 'buckets', detail: expect.stringContaining('absorbed into a single bucket') },
      ]),
    });
  });

  it('rejects a bucket holding fewer messages than the batch put in it', () => {
    const { messages, bucketTotals } = buildBatch([7n, 7n, 7n]);
    bucketTotals.set(7n, 1);

    const verdict = validateL1ToL2MessageBatchBuckets({ messages, bucketTotals, bucketCapacity: CAPACITY });

    expect(verdict.outcome).toEqual('invalid');
    expect(verdict).toMatchObject({
      mismatches: [{ kind: 'buckets', detail: expect.stringContaining('holds 1 messages but the batch put 3') }],
    });
  });

  it('is inconclusive when a bucket count cannot be read', () => {
    const { messages, bucketTotals } = buildBatch([7n, 7n, 7n]);
    bucketTotals.set(7n, undefined);

    const verdict = validateL1ToL2MessageBatchBuckets({ messages, bucketTotals, bucketCapacity: CAPACITY });

    expect(verdict).toMatchObject({ outcome: 'indeterminate', detail: expect.stringContaining('bucket 7') });
  });
});
