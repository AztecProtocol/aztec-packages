import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';

import { MessageSeenValidator } from './msg_seen_validator.js';

describe('MsgSeenValidator', () => {
  let validator: MessageSeenValidator;
  let currentTime = new Date();
  const logger = createLogger('p2p:msg_seen_validator_test');

  const makeMsgId = () => Fr.random().toString();

  const timeProvider = () => {
    return currentTime;
  };

  afterAll(() => {
    logger.info('Finished test \n\n\n\n');
  });

  it('adds a message successfully', () => {
    validator = new MessageSeenValidator(60); // 1 hour TTL
    const msgId = makeMsgId();
    expect(validator.addMessage(msgId)).toBe(true);
  });

  it('fails to add a message that has already been seen within the time window', () => {
    validator = new MessageSeenValidator(60); // 1 hour TTL
    const msgId = makeMsgId();
    validator.addMessage(msgId);
    // should fail
    expect(validator.addMessage(msgId)).toBe(false);
  });

  it('adds a duplicate message after the time limit', () => {
    validator = new MessageSeenValidator(60, timeProvider); // 1 hour TTL
    const msgId = makeMsgId();
    currentTime = new Date();
    expect(validator.addMessage(msgId)).toBe(true);

    currentTime = new Date(currentTime.getTime() + (61 * 60 + 1) * 1000); // 1 hour, 1 minute and 1 second later
    expect(validator.addMessage(msgId)).toBe(true);
  });

  it('adds multiple messages', () => {
    validator = new MessageSeenValidator(5, timeProvider); // 5 minutes TTL

    const messageIDs = Array.from({ length: 5 }, () => makeMsgId());

    for (let i = 0; i < 5; i++) {
      const msgId = messageIDs[i];
      expect(validator.addMessage(msgId)).toBe(true);
      // can't add the first message again
      expect(validator.addMessage(messageIDs[0])).toBe(false);
      currentTime = new Date(currentTime.getTime() + 61 * 1000); // 1 minute, 1 second later
    }
    // still can't add the first ID again
    expect(validator.addMessage(messageIDs[0])).toBe(false);
    // now move on 1 minute and we can
    currentTime = new Date(currentTime.getTime() + 60 * 1000);
    expect(validator.addMessage(messageIDs[0])).toBe(true);
  });
});
