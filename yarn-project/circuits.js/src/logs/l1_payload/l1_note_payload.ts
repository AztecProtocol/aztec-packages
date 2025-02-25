import { Vector } from '@aztec/circuits.js/types';
import { randomInt } from '@aztec/foundation/crypto';
import { type Fq, Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { NoteSelector } from '../../abi/note_selector.js';
import { AztecAddress } from '../../aztec-address/index.js';
import type { PrivateLog } from '../private_log.js';
import { PublicLog } from '../public_log.js';
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

  static async decryptAsIncoming(log: PrivateLog, sk: Fq): Promise<L1NotePayload | undefined> {
    const decryptedLog = await EncryptedLogPayload.decryptAsIncoming(log.fields, sk);
    if (!decryptedLog) {
      return undefined;
    }

    return this.fromIncomingBodyPlaintextContractAndPublicValues(
      decryptedLog.incomingBodyPlaintext,
      decryptedLog.contractAddress,
      /* publicValues */ [],
    );
  }

  static async decryptAsIncomingFromPublic(log: PublicLog, sk: Fq): Promise<L1NotePayload | undefined> {
    const { privateValues, publicValues } = parseLogFromPublic(log);
    if (!privateValues) {
      return undefined;
    }

    const decryptedLog = await EncryptedLogPayload.decryptAsIncoming(privateValues, sk);
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
  static async random(contract?: AztecAddress) {
    const numPrivateNoteValues = randomInt(2) + 1;
    const privateNoteValues = Array.from({ length: numPrivateNoteValues }, () => Fr.random());

    const numPublicNoteValues = randomInt(2) + 1;
    const publicNoteValues = Array.from({ length: numPublicNoteValues }, () => Fr.random());

    return new L1NotePayload(
      contract ?? (await AztecAddress.random()),
      Fr.random(),
      NoteSelector.random(),
      privateNoteValues,
      publicNoteValues,
    );
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
 * @returns An object containing the public values, encrypted log, and ciphertext length.
 */
function parseLogFromPublic(log: PublicLog) {
  // Extract lengths from the log
  // See aztec_nr/aztec/src/macros/note/mod.nr to see how the "finalization_log" is encoded.
  // Each length is stored in 2 bytes with a 0 separator byte between them:
  // [ publicLen[0], publicLen[1], 0, privateLen[0], privateLen[1] ]
  // Search the codebase for "disgusting encoding" to see other hardcoded instances of this encoding, that you might need to change if you ever find yourself here.
  const lengths = log.log[0].toBuffer().subarray(-5);
  const publicValuesLength = lengths.readUint16BE();
  const privateValuesLength = lengths.readUint16BE(3);

  // Now we get the fields corresponding to the values generated from private.
  // Note: +1 for the length values in position 0
  const privateValues = log.log.slice(1, 1 + privateValuesLength);

  // At last we load the public values
  const publicValues = log.log.slice(1 + privateValuesLength, 1 + privateValuesLength + publicValuesLength);

  return { publicValues, privateValues };
}
