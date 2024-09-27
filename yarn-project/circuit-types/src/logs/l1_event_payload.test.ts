import { AztecAddress } from '@aztec/circuits.js';

import { L1EventPayload } from './l1_event_payload.js';

describe('L1EventPayload', () => {
  it('can encode L1EventPayload to plaintext and back', () => {
    const app = AztecAddress.random();
    const original = L1EventPayload.random(app);
    const payloadPlaintext = original.toIncomingBodyPlaintext();
    const recovered = L1EventPayload.fromIncomingBodyPlaintextAndContractAddress(payloadPlaintext, app);

    expect(recovered).toEqual(original);
  });
});
