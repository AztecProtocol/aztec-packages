import { Buffer16, Buffer32 } from '@aztec/foundation/buffer';
import { randomBigInt } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { InboxLeaf } from '@aztec/stdlib/messaging';

import { type InboxMessage, updateRollingHash } from '../archiver/structs/inbox_message.js';

export function makeInboxMessage(
  previousRollingHash = Buffer16.ZERO,
  overrides: Partial<InboxMessage> = {},
): InboxMessage {
  const { l2BlockNumber = randomBigInt(100n) + 1n } = overrides;
  const { l1BlockNumber = l2BlockNumber } = overrides;
  const { l1BlockHash = Buffer32.random() } = overrides;
  const { leaf = Fr.random() } = overrides;
  const { rollingHash = updateRollingHash(previousRollingHash, leaf) } = overrides;
  const { index = InboxLeaf.smallestIndexFromL2Block(l2BlockNumber) } = overrides;

  return {
    index,
    leaf,
    l2BlockNumber,
    l1BlockNumber,
    l1BlockHash,
    rollingHash,
  };
}

export function makeInboxMessages(
  count: number,
  opts: {
    initialHash?: Buffer16;
    initialL2BlockNumber?: bigint;
    overrideFn?: (msg: InboxMessage, index: number) => InboxMessage;
  } = {},
): InboxMessage[] {
  const { initialHash = Buffer16.ZERO, overrideFn = msg => msg, initialL2BlockNumber = 1n } = opts;
  const messages: InboxMessage[] = [];
  let rollingHash = initialHash;
  for (let i = 0; i < count; i++) {
    const leaf = Fr.random();
    const l2BlockNumber = BigInt(i) + initialL2BlockNumber;
    const message = overrideFn(makeInboxMessage(rollingHash, { leaf, l2BlockNumber }), i);
    rollingHash = message.rollingHash;
    messages.push(message);
  }

  return messages;
}
