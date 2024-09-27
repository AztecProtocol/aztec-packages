import { AztecAddress } from '@aztec/circuits.js';
import { NoteSelector } from '@aztec/foundation/abi';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { Note } from './l1_payload/payload.js';

/**
 * A class which wraps note data which is pushed on L1.
 * @remarks This data is required to compute a nullifier/to spend a note. Along with that this class contains
 * the necessary functionality to encrypt and decrypt the data.
 */
export class NotePayload {
  constructor(
    /**
     * A note as emitted from Noir contract. Can be used along with private key to compute nullifier.
     */
    public note: Note,
    /**
     * Address of the contract this tx is interacting with.
     */
    public contractAddress: AztecAddress,
    /**
     * Storage slot of the underlying note.
     */
    public storageSlot: Fr,
    /**
     * Type identifier for the underlying note, required to determine how to compute its hash and nullifier.
     */
    public noteTypeId: NoteSelector,
  ) {}

  /**
   * Deserializes the NotePayload object from a Buffer.
   * @param plaintext - Incoming body plaintext.
   * @returns An instance of NotePayload.
   */
  static fromIncomingBodyPlaintextAndContractAddress(
    plaintext: Buffer | BufferReader,
    contractAddress: AztecAddress,
  ): NotePayload {
    const reader = BufferReader.asReader(plaintext);
    const storageSlot = Fr.fromBuffer(reader);
    const noteTypeId = NoteSelector.fromField(Fr.fromBuffer(reader));

    // 2 Fields (storage slot and note type id) are not included in the note buffer
    const fieldsInNote = reader.getLength() / 32 - 2;
    const note = new Note(reader.readArray(fieldsInNote, Fr));

    return new NotePayload(note, contractAddress, storageSlot, noteTypeId);
  }

  /**
   * Serializes the NotePayload object into a Buffer.
   * @returns Buffer representation of the NotePayload object.
   */
  toBuffer() {
    return serializeToBuffer([this.note, this.contractAddress, this.storageSlot, this.noteTypeId]);
  }

  /**
   * Create a random NotePayload object (useful for testing purposes).
   * @param contract - The address of a contract the note was emitted from.
   * @returns A random NotePayload object.
   */
  static random(contract = AztecAddress.random()) {
    return new NotePayload(Note.random(), contract, Fr.random(), NoteSelector.random());
  }

  public equals(other: NotePayload) {
    return (
      this.note.equals(other.note) &&
      this.contractAddress.equals(other.contractAddress) &&
      this.storageSlot.equals(other.storageSlot) &&
      this.noteTypeId.equals(other.noteTypeId)
    );
  }
}
