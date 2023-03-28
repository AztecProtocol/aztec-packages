import { deserializeField, Deserializer, serializeBufferArrayToVector } from '@aztec/foundation';
import { decryptNotePreimage, encryptNotePreimage } from './encrypt_note_preimage.js';
import { Grumpkin } from '@aztec/barretenberg.js/crypto';
import { Fr } from '@aztec/foundation/primitives';
import { AztecAddress } from '@aztec/foundation/aztec-address';

export class NotePreImage {
  constructor(public readonly fields: Fr[]) {}

  static fromBuffer(buf: Buffer) {
    const deserializer = new Deserializer(buf);
    const fields = deserializer.deserializeArray(deserializeField);

    return new NotePreImage(fields);
  }

  public toBuffer() {
    return serializeBufferArrayToVector(this.fields.map(f => f.toBuffer()));
  }

  public toEncryptedBuffer(ownerPubKey: AztecAddress, ephPrivKey: Buffer, grumpkin: Grumpkin) {
    return encryptNotePreimage(this, ownerPubKey, ephPrivKey, grumpkin);
  }

  static fromEncryptedBuffer(data: Buffer, ownerPrivKey: Buffer, grumpkin: Grumpkin) {
    const buf = decryptNotePreimage(data, ownerPrivKey, grumpkin);
    if (!buf) {
      return;
    }
    return NotePreImage.fromBuffer(buf);
  }
}
