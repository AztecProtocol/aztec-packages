import { Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';

import { z } from 'zod';

import { AztecAddress } from '../aztec-address/index.js';
import { type ZodFor, schemas } from '../schemas/index.js';
import { TxHash } from '../tx/tx_hash.js';
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
    /** The hash of the tx the note was created in. */
    public txHash: TxHash,
  ) {}

  toBuffer(): Buffer {
    return serializeToBuffer([this.note, this.recipient, this.contractAddress, this.storageSlot, this.txHash]);
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);

    const note = reader.readObject(Note);
    const recipient = reader.readObject(AztecAddress);
    const contractAddress = reader.readObject(AztecAddress);
    const storageSlot = reader.readObject(Fr);
    const txHash = reader.readObject(TxHash);

    return new this(note, recipient, contractAddress, storageSlot, txHash);
  }

  static get schema(): ZodFor<ExtendedNote> {
    return z
      .object({
        note: Note.schema,
        recipient: schemas.AztecAddress,
        contractAddress: schemas.AztecAddress,
        storageSlot: schemas.Fr,
        txHash: TxHash.schema,
      })
      .transform(({ note, recipient, contractAddress, storageSlot, txHash }) => {
        return new ExtendedNote(note, recipient, contractAddress, storageSlot, txHash);
      });
  }

  toString() {
    return bufferToHex(this.toBuffer());
  }

  static fromString(str: string) {
    return ExtendedNote.fromBuffer(hexToBuffer(str));
  }

  static async random() {
    return new ExtendedNote(
      Note.random(),
      await AztecAddress.random(),
      await AztecAddress.random(),
      Fr.random(),
      TxHash.random(),
    );
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
    /** The hash of the tx the note was created in. */
    txHash: TxHash,
    /** The nonce that was injected into the note hash preimage in order to guarantee uniqueness. */
    public noteNonce: Fr,
  ) {
    super(note, recipient, contractAddress, storageSlot, txHash);
  }

  static override get schema() {
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

  override toBuffer(): Buffer {
    return serializeToBuffer([
      this.note,
      this.recipient,
      this.contractAddress,
      this.storageSlot,
      this.txHash,
      this.noteNonce,
    ]);
  }

  static override async random() {
    return new UniqueNote(
      Note.random(),
      await AztecAddress.random(),
      await AztecAddress.random(),
      Fr.random(),
      TxHash.random(),
      Fr.random(),
    );
  }

  static override fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);

    const note = reader.readObject(Note);
    const recipient = reader.readObject(AztecAddress);
    const contractAddress = reader.readObject(AztecAddress);
    const storageSlot = reader.readObject(Fr);
    const txHash = reader.readObject(TxHash);
    const noteNonce = reader.readObject(Fr);

    return new this(note, recipient, contractAddress, storageSlot, txHash, noteNonce);
  }

  static override fromString(str: string) {
    return UniqueNote.fromBuffer(hexToBuffer(str));
  }
}
