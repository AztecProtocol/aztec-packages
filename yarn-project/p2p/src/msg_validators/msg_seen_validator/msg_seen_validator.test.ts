import { Fr } from '@aztec/foundation/fields';

import { MessageSeenValidator } from './msg_seen_validator.js';

describe('MsgSeenValidator', () => {
  let validator: MessageSeenValidator;

  const makeMsgId = () => Fr.random().toString();

  it('throws if created with invalid length', () => {
    expect(() => new MessageSeenValidator(0)).toThrow('Queue length must be greater than 0');
    expect(() => new MessageSeenValidator(-1)).toThrow('Queue length must be greater than 0');
  });

  it('adds a message successfully', () => {
    validator = new MessageSeenValidator(10); // 10 messages max
    const msgId = makeMsgId();
    expect(validator.addMessage(msgId)).toBe(true);
  });

  it('fails to add a message that is already in the queue', () => {
    validator = new MessageSeenValidator(10); // 10 messages max
    const msgId = makeMsgId();
    validator.addMessage(msgId);
    // should fail
    expect(validator.addMessage(msgId)).toBe(false);
  });

  it('adds a duplicate message after it has exited the queue', () => {
    validator = new MessageSeenValidator(10); // 10 messages max
    const msgId = makeMsgId();

    expect(validator.addMessage(msgId)).toBe(true);

    // Can't add the message again
    expect(validator.addMessage(msgId)).toBe(false);

    // add 9 more messages
    for (let i = 0; i < 9; i++) {
      expect(validator.addMessage(makeMsgId())).toBe(true);
    }

    // Still can't add the message
    expect(validator.addMessage(msgId)).toBe(false);

    // Now add one more
    expect(validator.addMessage(makeMsgId())).toBe(true);

    // now we should be able to add the first message again
    expect(validator.addMessage(msgId)).toBe(true);
  });

  it('can take many more messages than the queue length', () => {
    validator = new MessageSeenValidator(10); // 10 messages max

    // add 1000 messages
    for (let i = 0; i < 1000; i++) {
      expect(validator.size()).toBeLessThanOrEqual(10);
      // should always be able to add a message,
      expect(validator.addMessage(makeMsgId())).toBe(true);
    }
  });
});
