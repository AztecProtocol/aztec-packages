import { Grumpkin } from '@aztec/barretenberg.js/crypto';
import { BarretenbergWasm } from '@aztec/barretenberg.js/wasm';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { randomBytes } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/primitives';
import { NotePreImage } from './note_preimage.js';

describe('note_preimage', () => {
  it('convert to and from buffer', () => {
    const fields = Array.from({ length: 5 }).map(() => Fr.random());
    const notePreImage = new NotePreImage(fields);
    const buf = notePreImage.toBuffer();
    expect(NotePreImage.fromBuffer(buf)).toEqual(buf);
  });

  it('convert to and from encrypted buffer', () => {
    const fields = Array.from({ length: 5 }).map(() => Fr.random());
    const notePreImage = new NotePreImage(fields);
    const ownerPubKey = AztecAddress.random();
    const ephPrivKey = randomBytes(32);
    const grumpkin = new Grumpkin(new BarretenbergWasm());
    const buf = notePreImage.toEncryptedBuffer(ownerPubKey, ephPrivKey, grumpkin);
    expect(NotePreImage.fromBuffer(buf)).toEqual(buf);
  });
});
