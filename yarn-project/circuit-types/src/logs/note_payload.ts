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
  static fromIncomingBodyPlaintextAndContractAddress(plaintext: Buffer, contractAddress: AztecAddress): NotePayload {
    if (plaintext.length % Fr.SIZE_IN_BYTES !== 0) {
      throw new Error(`Plaintext length not a multiple of Fr: ${plaintext.length}`);
    }
    const reader = BufferReader.asReader(plaintext);
    const fields = reader.readArray(plaintext.length / Fr.SIZE_IN_BYTES, Fr);

    const storageSlot = fields[0];
    const noteTypeId = NoteSelector.fromField(fields[1]);

    const note = new Note(fields.slice(2));

    return new NotePayload(note, contractAddress, storageSlot, noteTypeId);
  }

  /**
   * Serializes the NotePayload object into a Buffer.
   * @returns Buffer representation of the NotePayload object.
   */
  toIncomingBodyPlaintext() {
    const fields = [this.storageSlot, this.noteTypeId.toField(), ...this.note.items];
    return serializeToBuffer(fields);
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
