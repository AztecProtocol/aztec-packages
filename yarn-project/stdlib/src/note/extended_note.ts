import { Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';

import { z } from 'zod';

import { AztecAddress } from '../aztec-address/index.js';
import { type ZodFor, schemas } from '../schemas/index.js';
import { Note } from './note.js';

/**
 * A note with contextual data.
 */
export class ExtendedNote {
  constructor(
    /** The note as emitted from the Noir contract. */
    public note: Note,
    /** The address whose public key was used to encrypt the note. */
    public recipient: AztecAddress,
    /** The contract address this note is created in. */
    public contractAddress: AztecAddress,
    /** The specific storage location of the note on the contract. */
    public storageSlot: Fr,
  ) {}

  toBuffer(): Buffer {
    return serializeToBuffer([this.note, this.recipient, this.contractAddress, this.storageSlot]);
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);

    const note = reader.readObject(Note);
    const recipient = reader.readObject(AztecAddress);
    const contractAddress = reader.readObject(AztecAddress);
    const storageSlot = reader.readObject(Fr);

    return new this(note, recipient, contractAddress, storageSlot);
  }

  static get schema(): ZodFor<ExtendedNote> {
    return z
      .object({
        note: Note.schema,
        recipient: schemas.AztecAddress,
        contractAddress: schemas.AztecAddress,
        storageSlot: schemas.Fr,
      })
      .transform(({ note, recipient, contractAddress, storageSlot }) => {
        return new ExtendedNote(note, recipient, contractAddress, storageSlot);
      });
  }

  toString() {
    return bufferToHex(this.toBuffer());
  }

  static fromString(str: string) {
    return ExtendedNote.fromBuffer(hexToBuffer(str));
  }

  static async random() {
    return new ExtendedNote(Note.random(), await AztecAddress.random(), await AztecAddress.random(), Fr.random());
  }
}

export class UniqueNote extends ExtendedNote {
  constructor(
    /** The note as emitted from the Noir contract. */
    note: Note,
    /** The recipient whose public key was used to encrypt the note. */
    recipient: AztecAddress,
    /** The contract address this note is created in. */
    contractAddress: AztecAddress,
    /** The specific storage location of the note on the contract. */
    storageSlot: Fr,
    /** The nonce of the note. */
    public nonce: Fr,
  ) {
    super(note, recipient, contractAddress, storageSlot);
  }

  static override get schema() {
    return z
      .object({
        note: Note.schema,
        recipient: schemas.AztecAddress,
        contractAddress: schemas.AztecAddress,
        storageSlot: schemas.Fr,
        nonce: schemas.Fr,
      })
      .transform(({ note, recipient, contractAddress, storageSlot, nonce }) => {
        return new UniqueNote(note, recipient, contractAddress, storageSlot, nonce);
      });
  }

  override toBuffer(): Buffer {
    return serializeToBuffer([this.note, this.recipient, this.contractAddress, this.storageSlot, this.nonce]);
  }

  static override async random() {
    return new UniqueNote(
      Note.random(),
      await AztecAddress.random(),
      await AztecAddress.random(),
      Fr.random(),
      Fr.random(),
    );
  }

  static override fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);

    const note = reader.readObject(Note);
    const recipient = reader.readObject(AztecAddress);
    const contractAddress = reader.readObject(AztecAddress);
    const storageSlot = reader.readObject(Fr);
    const nonce = reader.readObject(Fr);

    return new this(note, recipient, contractAddress, storageSlot, nonce);
  }

  static override fromString(str: string) {
    return UniqueNote.fromBuffer(hexToBuffer(str));
  }
}
