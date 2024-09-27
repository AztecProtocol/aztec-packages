import { Fr, GrumpkinScalar } from '@aztec/circuits.js';
import { Grumpkin } from '@aztec/circuits.js/barretenberg';

import { Event } from '../payload.js';
import { EncryptedEventLogIncomingBody } from './encrypted_event_log_incoming_body.js';

describe('encrypt log incoming body', () => {
  let grumpkin: Grumpkin;

  beforeAll(() => {
    grumpkin = new Grumpkin();
  });

  it('encrypt and decrypt an event log incoming body', () => {
    const ephSecretKey = GrumpkinScalar.random();
    const viewingSecretKey = GrumpkinScalar.random();

    const ephPubKey = grumpkin.mul(Grumpkin.generator, ephSecretKey);
    const viewingPubKey = grumpkin.mul(Grumpkin.generator, viewingSecretKey);

    const event = Event.random();
    const randomness = Fr.random();
    const eventTypeId = Fr.random();

    const body = new EncryptedEventLogIncomingBody(randomness, eventTypeId, event);

    const encrypted = body.computeCiphertext(ephSecretKey, viewingPubKey);

    const recreated = EncryptedEventLogIncomingBody.fromCiphertext(encrypted, viewingSecretKey, ephPubKey);

    expect(recreated.toBuffer()).toEqual(body.toBuffer());
  });
});
