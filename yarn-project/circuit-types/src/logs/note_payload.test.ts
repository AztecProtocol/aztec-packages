import { AztecAddress } from '@aztec/circuits.js';

import { NotePayload } from './note_payload.js';

describe('NotePayload', () => {
  it('can encode NotePayload to plaintext and back', () => {
    const app = AztecAddress.random();
    const original = NotePayload.random(app);
    const payloadPlaintext = original.toIncomingBodyPlaintext();
    const recovered = NotePayload.fromIncomingBodyPlaintextAndContractAddress(payloadPlaintext, app);

    expect(recovered).toEqual(original);
  });
});
