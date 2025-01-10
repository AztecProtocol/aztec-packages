import { AztecAddress, type PrivateLog, type PublicLog, Vector } from '@aztec/circuits.js';
import { NoteSelector } from '@aztec/foundation/abi';
import { randomInt } from '@aztec/foundation/crypto';
import { type Fq, Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

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
     * @dev Note that to recreate the correct note we need to merge privateNoteValues and publicNoteValues. To do that
     * we need access to the contract ABI (that is done in the NoteProcessor).
     */
    public privateNoteValues: Fr[],
    /**
     * Note values delivered in plaintext.
     * @dev Note that to recreate the correct note we need to merge privateNoteValues and publicNoteValues. To do that
     * we need access to the contract ABI (that is done in the NoteProcessor).
     */
    public publicNoteValues: Fr[],
  ) {}

  static fromIncomingBodyPlaintextContractAndPublicValues(
    plaintext: Buffer,
    contractAddress: AztecAddress,
    publicNoteValues: Fr[],
  ): L1NotePayload | undefined {
    try {
      const reader = BufferReader.asReader(plaintext);
      const fields = reader.readArray(plaintext.length / Fr.SIZE_IN_BYTES, Fr);

      const storageSlot = fields[0];
      const noteTypeId = NoteSelector.fromField(fields[1]);

      const privateNoteValues = fields.slice(2);

      return new L1NotePayload(contractAddress, storageSlot, noteTypeId, privateNoteValues, publicNoteValues);
    } catch (e) {
      return undefined;
    }
  }

  static decryptAsIncoming(log: PrivateLog, sk: Fq): L1NotePayload | undefined {
    const decryptedLog = EncryptedLogPayload.decryptAsIncoming(log.fields, sk);
    if (!decryptedLog) {
      return undefined;
    }

    return this.fromIncomingBodyPlaintextContractAndPublicValues(
      decryptedLog.incomingBodyPlaintext,
      decryptedLog.contractAddress,
      /* publicValues */ [],
    );
  }

  static decryptAsIncomingFromPublic(log: PublicLog, sk: Fq): L1NotePayload | undefined {
    const { privateValues, publicValues } = parseLogFromPublic(log);
    if (!privateValues) {
      return undefined;
    }

    const decryptedLog = EncryptedLogPayload.decryptAsIncoming(privateValues, sk);
    if (!decryptedLog) {
      return undefined;
    }

    return this.fromIncomingBodyPlaintextContractAndPublicValues(
      decryptedLog.incomingBodyPlaintext,
      decryptedLog.contractAddress,
      publicValues,
    );
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
  static random(contract = AztecAddress.random()) {
    const numPrivateNoteValues = randomInt(2) + 1;
    const privateNoteValues = Array.from({ length: numPrivateNoteValues }, () => Fr.random());

    const numPublicNoteValues = randomInt(2) + 1;
    const publicNoteValues = Array.from({ length: numPublicNoteValues }, () => Fr.random());

    return new L1NotePayload(contract, Fr.random(), NoteSelector.random(), privateNoteValues, publicNoteValues);
  }

  public equals(other: L1NotePayload) {
    return (
      this.contractAddress.equals(other.contractAddress) &&
      this.storageSlot.equals(other.storageSlot) &&
      this.noteTypeId.equals(other.noteTypeId) &&
      this.privateNoteValues.every((value, index) => value.equals(other.privateNoteValues[index])) &&
      this.publicNoteValues.every((value, index) => value.equals(other.publicNoteValues[index]))
    );
  }

  toBuffer() {
    return serializeToBuffer(
      this.contractAddress,
      this.storageSlot,
      this.noteTypeId,
      new Vector(this.privateNoteValues),
      new Vector(this.publicNoteValues),
    );
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new L1NotePayload(
      reader.readObject(AztecAddress),
      reader.readObject(Fr),
      reader.readObject(NoteSelector),
      reader.readVector(Fr),
      reader.readVector(Fr),
    );
  }
}

/**
 * Parse the given log into an array of public values and an encrypted log.
 *
 * @param log - Log to be parsed.
 * @returns An object containing the public values and the encrypted log.
 */
function parseLogFromPublic(log: PublicLog) {
  //TODO(MW): Ensure len
  const logFields = log.log.slice(0, 12);

  // Extract public values from the log
  const publicValuesLength = logFields[0].toNumber();

  // Minus 1 for the public values length in position 0
  const privateValuesLength = logFields.length - publicValuesLength - 1;

  // Now we get the fields corresponding to the values generated from private.
  const privateValues = logFields.slice(1, privateValuesLength + 1);

  // At last we load the public values
  const publicValues = logFields.slice(privateValuesLength + 1);

  return { publicValues, privateValues };
}
