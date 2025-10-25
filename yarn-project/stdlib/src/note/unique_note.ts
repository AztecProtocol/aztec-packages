import { Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';

import { z } from 'zod';

import { AztecAddress } from '../aztec-address/index.js';
import { type ZodFor, schemas } from '../schemas/index.js';
import { TxHash } from '../tx/tx_hash.js';
import { Note } from './note.js';

/**
 * A note with contextual data and a nonce that makes it unique.
 */
export class UniqueNote {
  constructor(
    /** The note as emitted from the Noir contract. */
    public note: Note,
    /** The recipient whose public key was used to encrypt the note. */
    public recipient: AztecAddress,
    /** The contract address this note is created in. */
    public contractAddress: AztecAddress,
    /** The specific storage location of the note on the contract. */
    public storageSlot: Fr,
    /** The hash of the tx the note was created in. */
    public txHash: TxHash,
    /** The nonce that was injected into the note hash preimage in order to guarantee uniqueness. */
    public noteNonce: Fr,
  ) {}

  static get schema(): ZodFor<UniqueNote> {
    return z
      .object({
        note: Note.schema,
        recipient: schemas.AztecAddress,
        contractAddress: schemas.AztecAddress,
        storageSlot: schemas.Fr,
        txHash: TxHash.schema,
        noteNonce: schemas.Fr,
      })
      .transform(({ note, recipient, contractAddress, storageSlot, txHash, noteNonce }) => {
        return new UniqueNote(note, recipient, contractAddress, storageSlot, txHash, noteNonce);
      });
  }

  toBuffer(): Buffer {
    return serializeToBuffer([
      this.note,
      this.recipient,
      this.contractAddress,
      this.storageSlot,
      this.txHash,
      this.noteNonce,
    ]);
  }

  static async random() {
    return new UniqueNote(
      Note.random(),
      await AztecAddress.random(),
      await AztecAddress.random(),
      Fr.random(),
      TxHash.random(),
      Fr.random(),
    );
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);

    const note = reader.readObject(Note);
    const recipient = reader.readObject(AztecAddress);
    const contractAddress = reader.readObject(AztecAddress);
    const storageSlot = reader.readObject(Fr);
    const txHash = reader.readObject(TxHash);
    const noteNonce = reader.readObject(Fr);

    return new UniqueNote(note, recipient, contractAddress, storageSlot, txHash, noteNonce);
  }

  static fromString(str: string) {
    return UniqueNote.fromBuffer(hexToBuffer(str));
  }

  toString() {
    return bufferToHex(this.toBuffer());
  }
}
