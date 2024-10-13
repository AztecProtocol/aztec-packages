import { AztecAddress } from '@aztec/circuits.js';
import { NoteSelector } from '@aztec/foundation/abi';
import { type Fq, Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { type EncryptedL2NoteLog } from '../encrypted_l2_note_log.js';
import { EncryptedLogPayload } from './encrypted_log_payload.js';
import { Note } from './payload.js';

/**
 * A class which wraps note data which is pushed on L1.
 * @remarks This data is required to compute a nullifier/to spend a note. Along with that this class contains
 * the necessary functionality to encrypt and decrypt the data.
 */
export class L1NotePayload {
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

  static fromIncomingBodyPlaintextAndContractAddress(
    plaintext: Buffer,
    contractAddress: AztecAddress,
  ): L1NotePayload | undefined {
    try {
      const reader = BufferReader.asReader(plaintext);
      const fields = reader.readArray(plaintext.length / Fr.SIZE_IN_BYTES, Fr);

      const storageSlot = fields[0];
      const noteTypeId = NoteSelector.fromField(fields[1]);

      const note = new Note(fields.slice(2));

      return new L1NotePayload(note, contractAddress, storageSlot, noteTypeId);
    } catch (e) {
      return undefined;
    }
  }

  static decryptAsIncoming(log: EncryptedL2NoteLog, sk: Fq): L1NotePayload | undefined {
    const decryptedLog = EncryptedLogPayload.decryptAsIncoming(log.data, sk);
    if (!decryptedLog) {
      return undefined;
    }

    return this.fromIncomingBodyPlaintextAndContractAddress(
      decryptedLog.incomingBodyPlaintext,
      decryptedLog.contractAddress,
    );
  }

  static decryptAsOutgoing(log: EncryptedL2NoteLog, sk: Fq): L1NotePayload | undefined {
    const decryptedLog = EncryptedLogPayload.decryptAsOutgoing(log.data, sk);
    if (!decryptedLog) {
      return undefined;
    }

    return this.fromIncomingBodyPlaintextAndContractAddress(
      decryptedLog.incomingBodyPlaintext,
      decryptedLog.contractAddress,
    );
  }

  /**
   * Serializes the L1NotePayload object into a Buffer.
   * @returns Buffer representation of the L1NotePayload object.
   */
  toIncomingBodyPlaintext() {
    const fields = [this.storageSlot, this.noteTypeId.toField(), ...this.note.items];
    return serializeToBuffer(fields);
  }

  /**
   * Create a random L1NotePayload object (useful for testing purposes).
   * @param contract - The address of a contract the note was emitted from.
   * @returns A random L1NotePayload object.
   */
  static random(contract = AztecAddress.random()) {
    return new L1NotePayload(Note.random(), contract, Fr.random(), NoteSelector.random());
  }

  public equals(other: L1NotePayload) {
    return (
      this.note.equals(other.note) &&
      this.contractAddress.equals(other.contractAddress) &&
      this.storageSlot.equals(other.storageSlot) &&
      this.noteTypeId.equals(other.noteTypeId)
    );
  }
}
