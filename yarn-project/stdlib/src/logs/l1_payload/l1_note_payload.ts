import { randomInt } from '@aztec/foundation/crypto';
import { type Fq, Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { NoteSelector } from '../../abi/note_selector.js';
import { AztecAddress } from '../../aztec-address/index.js';
import { Vector } from '../../types/index.js';
import type { PrivateLog } from '../private_log.js';
import { EncryptedLogPayload } from './encrypted_log_payload.js';

/**
 * A class which wraps note data which is pushed on L1.
 * @remarks This data is required to compute a nullifier/to spend a note. Along with that this class contains
 * the necessary functionality to encrypt and decrypt the data.
 */
export class L1NotePayload {
  constructor(
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
    /**
     * Note values delivered encrypted.
     */
    public privateNoteValues: Fr[],
  ) {}

  static fromIncomingBodyPlaintextContract(
    plaintext: Buffer,
    contractAddress: AztecAddress,
  ): L1NotePayload | undefined {
    try {
      const reader = BufferReader.asReader(plaintext);
      const fields = reader.readArray(plaintext.length / Fr.SIZE_IN_BYTES, Fr);

      const storageSlot = fields[0];
      const noteTypeId = NoteSelector.fromField(fields[1]);

      const privateNoteValues = fields.slice(2);

      return new L1NotePayload(contractAddress, storageSlot, noteTypeId, privateNoteValues);
    } catch (e) {
      return undefined;
    }
  }

  static async decryptAsIncoming(log: PrivateLog, sk: Fq): Promise<L1NotePayload | undefined> {
    const decryptedLog = await EncryptedLogPayload.decryptAsIncoming(log.fields, sk);
    if (!decryptedLog) {
      return undefined;
    }

    return this.fromIncomingBodyPlaintextContract(decryptedLog.incomingBodyPlaintext, decryptedLog.contractAddress);
  }

  /**
   * Serializes the L1NotePayload object into a Buffer.
   * @returns Buffer representation of the L1NotePayload object.
   */
  toIncomingBodyPlaintext() {
    const fields = [this.storageSlot, this.noteTypeId.toField(), ...this.privateNoteValues];
    return serializeToBuffer(fields);
  }

  /**
   * Create a random L1NotePayload object (useful for testing purposes).
   * @param contract - The address of a contract the note was emitted from.
   * @returns A random L1NotePayload object.
   */
  static async random(contract?: AztecAddress) {
    const numPrivateNoteValues = randomInt(2) + 1;
    const privateNoteValues = Array.from({ length: numPrivateNoteValues }, () => Fr.random());

    return new L1NotePayload(
      contract ?? (await AztecAddress.random()),
      Fr.random(),
      NoteSelector.random(),
      privateNoteValues,
    );
  }

  public equals(other: L1NotePayload) {
    return (
      this.contractAddress.equals(other.contractAddress) &&
      this.storageSlot.equals(other.storageSlot) &&
      this.noteTypeId.equals(other.noteTypeId) &&
      this.privateNoteValues.every((value, index) => value.equals(other.privateNoteValues[index]))
    );
  }

  toBuffer() {
    return serializeToBuffer(
      this.contractAddress,
      this.storageSlot,
      this.noteTypeId,
      new Vector(this.privateNoteValues),
    );
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new L1NotePayload(
      reader.readObject(AztecAddress),
      reader.readObject(Fr),
      reader.readObject(NoteSelector),
      reader.readVector(Fr),
    );
  }
}
