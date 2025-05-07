import { makeInboxMessage } from '../../test/mock_structs.js';
import { deserializeInboxMessage, serializeInboxMessage } from './inbox_message.js';

describe('InboxMessage', () => {
  it('serializes and deserializes an inbox message', () => {
    const message = makeInboxMessage();
    const serialized = serializeInboxMessage(message);
    const deserialized = deserializeInboxMessage(serialized);
    expect(deserialized).toEqual(message);
  });
});
