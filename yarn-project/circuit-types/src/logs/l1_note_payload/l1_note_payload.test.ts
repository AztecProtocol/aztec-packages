import { AztecAddress, KeyValidationRequest, computeOvskApp, derivePublicKeyFromSecretKey } from '@aztec/circuits.js';
import { Grumpkin } from '@aztec/circuits.js/barretenberg';
import { Fr, GrumpkinScalar } from '@aztec/foundation/fields';

import { L1NotePayload } from './l1_note_payload.js';

describe('L1 Note Payload', () => {
  let grumpkin: Grumpkin;

  beforeAll(() => {
    grumpkin = new Grumpkin();
  });

  it('convert to and from buffer', () => {
    const payload = L1NotePayload.random();
    const buf = payload.toBuffer();
    expect(L1NotePayload.fromBuffer(buf)).toEqual(payload);
  });

  describe('encrypt and decrypt a full log', () => {
    let ovskM: GrumpkinScalar;
    let ivsk: GrumpkinScalar;

    let payload: L1NotePayload;
    let encrypted: Buffer;

    beforeAll(() => {
      payload = L1NotePayload.random();

      ovskM = GrumpkinScalar.random();
      ivsk = GrumpkinScalar.random();

      const ovpkM = derivePublicKeyFromSecretKey(ovskM);

      const ovskApp = computeOvskApp(ovskM, payload.contractAddress);
      // TODO(benesjan): get rid of this ugly conversion
      const ovskAppFr = Fr.fromBuffer(ovskApp.toBuffer());
      const ovKeys = new KeyValidationRequest(ovpkM, ovskAppFr);

      const ephSk = GrumpkinScalar.random();

      const recipientAddress = AztecAddress.random();
      const ivpk = grumpkin.mul(Grumpkin.generator, ivsk);

      encrypted = payload.encrypt(ephSk, recipientAddress, ivpk, ovKeys);
    });

    it('decrypt a log as incoming', () => {
      const recreated = L1NotePayload.decryptAsIncoming(encrypted, ivsk);

      expect(recreated.toBuffer()).toEqual(payload.toBuffer());
    });

    it('decrypt a log as outgoing', () => {
      const recreated = L1NotePayload.decryptAsOutgoing(encrypted, ovskM);

      expect(recreated.toBuffer()).toEqual(payload.toBuffer());
    });
  });
});
