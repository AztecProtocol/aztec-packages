import { Fr } from '@aztec/foundation/curves/bn254';
import { jsonParseWithSchema, jsonStringify } from '@aztec/foundation/json-rpc';

import { InboxMessagePrefixRef } from './inbox_message_prefix_ref.js';

describe('InboxMessagePrefixRef', () => {
  it('serializes and deserializes round-trip', () => {
    const ref = new InboxMessagePrefixRef(Fr.random());
    const deserialized = InboxMessagePrefixRef.fromBuffer(ref.toBuffer());
    expect(deserialized).toEqual(ref);
    expect(deserialized.equals(ref)).toBe(true);
  });

  it('serializes to exactly one field element', () => {
    const ref = InboxMessagePrefixRef.random();
    expect(ref.toBuffer().length).toBe(InboxMessagePrefixRef.SIZE);
    expect(ref.toBuffer()).toEqual(ref.inboxRollingHash.toBuffer());
    expect(ref.getSize()).toBe(InboxMessagePrefixRef.SIZE);
  });

  it('compares by rolling hash only', () => {
    const ref = new InboxMessagePrefixRef(new Fr(9n));
    expect(ref.equals(new InboxMessagePrefixRef(new Fr(10n)))).toBe(false);
    expect(ref.equals(new InboxMessagePrefixRef(new Fr(9n)))).toBe(true);
  });

  it('derives from a message position and is zero for the empty prefix', () => {
    const rollingHash = Fr.random();
    expect(InboxMessagePrefixRef.fromPosition({ totalMessageCount: 7n, rollingHash }).inboxRollingHash).toEqual(
      rollingHash,
    );
    expect(InboxMessagePrefixRef.empty().inboxRollingHash).toEqual(Fr.ZERO);
  });

  it('round-trips through its zod schema', () => {
    const ref = InboxMessagePrefixRef.random();
    expect(jsonParseWithSchema(jsonStringify(ref), InboxMessagePrefixRef.schema)).toEqual(ref);
  });
});
