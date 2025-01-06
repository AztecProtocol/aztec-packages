import { AztecAddress, Fr } from '@aztec/circuits.js';
import { NoteSelector } from '@aztec/foundation/abi';
import { schemas } from '@aztec/foundation/schemas';
import { BufferReader } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';

import { z } from 'zod';

import { Note } from '../logs/l1_payload/payload.js';
import { TxHash } from '../tx/tx_hash.js';

/**
 * A note with contextual data.
 */
export class ExtendedNote {
  constructor(
    /** The note as emitted from the Noir contract. */
    public note: Note,
    /** The owner whose public key was used to encrypt the note. */
    public owner: AztecAddress,
    /** The contract address this note is created in. */
    public contractAddress: AztecAddress,
    /** The specific storage location of the note on the contract. */
    public storageSlot: Fr,
    /** The type identifier of the note on the contract. */
    public noteTypeId: NoteSelector,
    /** The hash of the tx the note was created in. */
    public txHash: TxHash,
  ) {}

  toBuffer(): Buffer {
    return Buffer.concat([
      this.note.toBuffer(),
      this.owner.toBuffer(),
      this.contractAddress.toBuffer(),
      this.storageSlot.toBuffer(),
      this.noteTypeId.toBuffer(),
      this.txHash.buffer,
    ]);
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);

    const note = Note.fromBuffer(reader);
    const owner = AztecAddress.fromBuffer(reader);
    const contractAddress = AztecAddress.fromBuffer(reader);
    const storageSlot = Fr.fromBuffer(reader);
    const noteTypeId = reader.readObject(NoteSelector);
    const txHash = new TxHash(reader.readBytes(TxHash.SIZE));

    return new this(note, owner, contractAddress, storageSlot, noteTypeId, txHash);
  }

  static get schema() {
    return z
      .object({
        note: Note.schema,
        owner: schemas.AztecAddress,
        contractAddress: schemas.AztecAddress,
        storageSlot: schemas.Fr,
        noteTypeId: schemas.NoteSelector,
        txHash: TxHash.schema,
      })
      .transform(({ note, owner, contractAddress, storageSlot, noteTypeId, txHash }) => {
        return new ExtendedNote(note, owner, contractAddress, storageSlot, noteTypeId, txHash);
      });
  }

  toString() {
    return bufferToHex(this.toBuffer());
  }

  static fromString(str: string) {
    return ExtendedNote.fromBuffer(hexToBuffer(str));
  }

  static random() {
    return new ExtendedNote(
      Note.random(),
      AztecAddress.random(),
      AztecAddress.random(),
      Fr.random(),
      NoteSelector.random(),
      TxHash.random(),
    );
  }
}

export class UniqueNote extends ExtendedNote {
  constructor(
    /** The note as emitted from the Noir contract. */
    note: Note,
    /** The owner whose public key was used to encrypt the note. */
    owner: AztecAddress,
    /** The contract address this note is created in. */
    contractAddress: AztecAddress,
    /** The specific storage location of the note on the contract. */
    storageSlot: Fr,
    /** The type identifier of the note on the contract. */
    noteTypeId: NoteSelector,
    /** The hash of the tx the note was created in. */
    txHash: TxHash,
    /** The nonce of the note. */
    public nonce: Fr,
  ) {
    super(note, owner, contractAddress, storageSlot, noteTypeId, txHash);
  }

  static override get schema() {
    return z
      .object({
        note: Note.schema,
        owner: schemas.AztecAddress,
        contractAddress: schemas.AztecAddress,
        storageSlot: schemas.Fr,
        noteTypeId: schemas.NoteSelector,
        txHash: TxHash.schema,
        nonce: schemas.Fr,
      })
      .transform(({ note, owner, contractAddress, storageSlot, noteTypeId, txHash, nonce }) => {
        return new UniqueNote(note, owner, contractAddress, storageSlot, noteTypeId, txHash, nonce);
      });
  }

  override toBuffer(): Buffer {
    return Buffer.concat([
      this.note.toBuffer(),
      this.owner.toBuffer(),
      this.contractAddress.toBuffer(),
      this.storageSlot.toBuffer(),
      this.noteTypeId.toBuffer(),
      this.txHash.buffer,
      this.nonce.toBuffer(),
    ]);
  }

  static override random() {
    return new UniqueNote(
      Note.random(),
      AztecAddress.random(),
      AztecAddress.random(),
      Fr.random(),
      NoteSelector.random(),
      TxHash.random(),
      Fr.random(),
    );
  }

  static override fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);

    const note = Note.fromBuffer(reader);
    const owner = AztecAddress.fromBuffer(reader);
    const contractAddress = AztecAddress.fromBuffer(reader);
    const storageSlot = Fr.fromBuffer(reader);
    const noteTypeId = reader.readObject(NoteSelector);
    const txHash = new TxHash(reader.readBytes(TxHash.SIZE));
    const nonce = Fr.fromBuffer(reader);

    return new this(note, owner, contractAddress, storageSlot, noteTypeId, txHash, nonce);
  }

  static override fromString(str: string) {
    return UniqueNote.fromBuffer(hexToBuffer(str));
  }
}
