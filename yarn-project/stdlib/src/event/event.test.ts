import { Fr } from '@aztec/foundation/fields';

import { Event } from './event.js';

describe('event', () => {
  it('convert to and from buffer', () => {
    const fields = Array.from({ length: 5 }).map(() => Fr.random());
    const event = new Event(fields);
    const buf = event.toBuffer();
    expect(Event.fromBuffer(buf)).toEqual(event);
  });
});
