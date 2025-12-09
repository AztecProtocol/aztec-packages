import { CheckpointNumber } from '@aztec/foundation/branded-types';
import { Buffer16, Buffer32 } from '@aztec/foundation/buffer';
import { randomBigInt, randomInt } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/curves/bn254';
import { InboxLeaf } from '@aztec/stdlib/messaging';

import { type InboxMessage, updateRollingHash } from '../archiver/structs/inbox_message.js';

export function makeInboxMessage(
  previousRollingHash = Buffer16.ZERO,
  overrides: Partial<InboxMessage> = {},
): InboxMessage {
  const { checkpointNumber = CheckpointNumber(randomInt(100) + 1) } = overrides;
  const { l1BlockNumber = randomBigInt(100n) + 1n } = overrides;
  const { l1BlockHash = Buffer32.random() } = overrides;
  const { leaf = Fr.random() } = overrides;
  const { rollingHash = updateRollingHash(previousRollingHash, leaf) } = overrides;
  const { index = InboxLeaf.smallestIndexForCheckpoint(checkpointNumber) } = overrides;

  return {
    index,
    leaf,
    checkpointNumber,
    l1BlockNumber,
    l1BlockHash,
    rollingHash,
  };
}

export function makeInboxMessages(
  count: number,
  opts: {
    initialHash?: Buffer16;
    initialCheckpointNumber?: CheckpointNumber;
    overrideFn?: (msg: InboxMessage, index: number) => InboxMessage;
  } = {},
): InboxMessage[] {
  const { initialHash = Buffer16.ZERO, overrideFn = msg => msg, initialCheckpointNumber = 1 } = opts;
  const messages: InboxMessage[] = [];
  let rollingHash = initialHash;
  for (let i = 0; i < count; i++) {
    const leaf = Fr.random();
    const checkpointNumber = CheckpointNumber(i + initialCheckpointNumber);
    const message = overrideFn(makeInboxMessage(rollingHash, { leaf, checkpointNumber }), i);
    rollingHash = message.rollingHash;
    messages.push(message);
  }

  return messages;
}
