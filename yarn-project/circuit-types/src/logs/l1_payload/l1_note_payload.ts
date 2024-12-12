import { AztecAddress, type PrivateLog, Vector } from '@aztec/circuits.js';
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

    public plaintext: Fr[],
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

      return new L1NotePayload(contractAddress, storageSlot, noteTypeId, privateNoteValues, publicNoteValues, fields);
    } catch (e) {
      return undefined;
    }
  }

  static decryptAsIncoming(log: PrivateLog, sk: Fq): L1NotePayload | undefined {
    const decryptedLog = EncryptedLogPayload.decryptAsIncoming(log, sk);
    if (!decryptedLog) {
      return undefined;
    }

    return this.fromIncomingBodyPlaintextContractAndPublicValues(
      decryptedLog.incomingBodyPlaintext,
      decryptedLog.contractAddress,
      /* publicValues */ [],
    );
  }

  static decryptAsIncomingFromPublic(log: Buffer, sk: Fq): L1NotePayload | undefined {
    const { privateValues, publicValues } = parseLogFromPublic(log);
    if (!privateValues) {
      return undefined;
    }

    const decryptedLog = EncryptedLogPayload.decryptAsIncomingFromPublic(privateValues, sk);
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

    // Note that this plaintext will not correspond to the private and public values above, nor the storage slot and
    // note type id.
    const plaintextLen = randomInt(5) + 1;
    const plaintext = Array.from({ length: plaintextLen }, () => Fr.random());

    return new L1NotePayload(contract, Fr.random(), NoteSelector.random(), privateNoteValues, publicNoteValues, plaintext);
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
      new Vector(this.plaintext),
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
function parseLogFromPublic(log: Buffer) {
  // First we remove padding bytes
  const processedLog = removePaddingBytes(log);
  if (!processedLog) {
    return {};
  }

  const reader = new BufferReader(processedLog);

  // Then we extract public values from the log
  const numPublicValues = reader.readUInt8();

  const publicValuesLength = numPublicValues * Fr.SIZE_IN_BYTES;
  const privateValuesLength = reader.remainingBytes() - publicValuesLength;

  // Now we get the buffer corresponding to the values generated from private.
  const privateValues = reader.readBytes(privateValuesLength);

  // At last we load the public values
  const publicValues = reader.readArray(numPublicValues, Fr);

  return { publicValues, privateValues };
}

/**
 * When a log is emitted via the unencrypted log channel each field contains only 1 byte. OTOH when a log is emitted
 * via the encrypted log channel there are no empty bytes. This function removes the padding bytes.
 * @param unprocessedLog - Log to be processed.
 * @returns Log with padding bytes removed.
 */
function removePaddingBytes(unprocessedLog: Buffer) {
  // Determine whether first 31 bytes of each 32 bytes block of bytes are 0
  const is1FieldPerByte = unprocessedLog.every((byte, index) => index % 32 === 31 || byte === 0);
  if (!is1FieldPerByte) {
    return;
  }

  // We take every 32nd byte from the log and return the result
  const processedLog = Buffer.alloc(unprocessedLog.length / 32);
  for (let i = 0; i < processedLog.length; i++) {
    processedLog[i] = unprocessedLog[31 + i * 32];
  }

  return processedLog;
}
