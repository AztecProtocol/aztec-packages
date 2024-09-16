import { AztecAddress, type GrumpkinScalar, type KeyValidationRequest, type PublicKey } from '@aztec/circuits.js';
import { NoteSelector } from '@aztec/foundation/abi';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { EncryptedNoteLogIncomingBody } from './encrypted_log_incoming_body/index.js';
import { L1Payload } from './l1_payload.js';
import { Note } from './payload.js';

/**
 * A class which wraps note data which is pushed on L1.
 * @remarks This data is required to compute a nullifier/to spend a note. Along with that this class contains
 * the necessary functionality to encrypt and decrypt the data.
 */
export class L1NotePayload extends L1Payload {
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
  ) {
    super();
  }

  /**
   * Deserializes the L1NotePayload object from a Buffer.
   * @param buffer - Buffer or BufferReader object to deserialize.
   * @returns An instance of L1NotePayload.
   */
  static fromBuffer(buffer: Buffer | BufferReader): L1NotePayload {
    const reader = BufferReader.asReader(buffer);
    return new L1NotePayload(
      reader.readObject(Note),
      reader.readObject(AztecAddress),
      Fr.fromBuffer(reader),
      reader.readObject(NoteSelector),
    );
  }

  /**
   * Serializes the L1NotePayload object into a Buffer.
   * @returns Buffer representation of the L1NotePayload object.
   */
  toBuffer() {
    return serializeToBuffer([this.note, this.contractAddress, this.storageSlot, this.noteTypeId]);
  }

  /**
   * Create a random L1NotePayload object (useful for testing purposes).
   * @param contract - The address of a contract the note was emitted from.
   * @returns A random L1NotePayload object.
   */
  static random(contract = AztecAddress.random()) {
    return new L1NotePayload(Note.random(), contract, Fr.random(), NoteSelector.random());
  }

  public encrypt(ephSk: GrumpkinScalar, recipient: AztecAddress, ivpk: PublicKey, ovKeys: KeyValidationRequest) {
    // TODO(#8558): numPubliclyDeliveredValues could occupy just a single bit if we store info about partial fields
    // in the ABI
    // We always set the value to 0 here as we don't need partial notes encryption support in TS
    const numPubliclyDeliveredValues = 0;
    const encryptedPayload = super._encrypt(
      this.contractAddress,
      ephSk,
      recipient,
      ivpk,
      ovKeys,
      new EncryptedNoteLogIncomingBody(this.storageSlot, this.noteTypeId, this.note),
    );
    return Buffer.concat([Buffer.alloc(1, numPubliclyDeliveredValues), encryptedPayload]);
  }

  /**
   * Decrypts a ciphertext as an incoming log.
   *
   * This is executable by the recipient of the note, and uses the ivsk to decrypt the payload.
   * The outgoing parts of the log are ignored entirely.
   *
   * Produces the same output as `decryptAsOutgoing`.
   *
   * @param ciphertext - The ciphertext for the log
   * @param ivsk - The incoming viewing secret key, used to decrypt the logs
   * @returns The decrypted log payload
   */
  public static decryptAsIncoming(ciphertext: Buffer | bigint[], ivsk: GrumpkinScalar) {
    const input = Buffer.isBuffer(ciphertext) ? ciphertext : Buffer.from(ciphertext.map((x: bigint) => Number(x)));
    const [publicValues, remainingCiphertext] = this.#getPublicValuesAndRemainingCipherText(input);

    const [address, incomingBody] = super._decryptAsIncoming(
      remainingCiphertext,
      ivsk,
      EncryptedNoteLogIncomingBody.fromCiphertext,
    );

    // Partial fields are expected to be at the end of the note
    const note = new Note([...incomingBody.note.items, ...publicValues]);

    return new L1NotePayload(note, address, incomingBody.storageSlot, incomingBody.noteTypeId);
  }

  /**
   * Decrypts a ciphertext as an outgoing log.
   *
   * This is executable by the sender of the note, and uses the ovsk to decrypt the payload.
   * The outgoing parts are decrypted to retrieve information that allows the sender to
   * decrypt the incoming log, and learn about the note contents.
   *
   * Produces the same output as `decryptAsIncoming`.
   *
   * @param ciphertext - The ciphertext for the log
   * @param ovsk - The outgoing viewing secret key, used to decrypt the logs
   * @returns The decrypted log payload
   */
  public static decryptAsOutgoing(ciphertext: Buffer | bigint[], ovsk: GrumpkinScalar) {
    const input = Buffer.isBuffer(ciphertext) ? ciphertext : Buffer.from(ciphertext.map((x: bigint) => Number(x)));
    const [publicValues, remainingCiphertext] = this.#getPublicValuesAndRemainingCipherText(input);

    const [address, incomingBody] = super._decryptAsOutgoing(
      remainingCiphertext,
      ovsk,
      EncryptedNoteLogIncomingBody.fromCiphertext,
    );

    // Partial fields are expected to be at the end of the note
    const note = new Note([...incomingBody.note.items, ...publicValues]);

    return new L1NotePayload(note, address, incomingBody.storageSlot, incomingBody.noteTypeId);
  }

  public equals(other: L1NotePayload) {
    return (
      this.note.equals(other.note) &&
      this.contractAddress.equals(other.contractAddress) &&
      this.storageSlot.equals(other.storageSlot) &&
      this.noteTypeId.equals(other.noteTypeId)
    );
  }

  static #getPublicValuesAndRemainingCipherText(input: Buffer): [Fr[], Buffer] {
    const reader = BufferReader.asReader(input);
    const numPubliclyDeliveredValues = reader.readUInt8();

    const remainingData = reader.readToEnd();
    const publicValuesData = remainingData.subarray(
      remainingData.length - numPubliclyDeliveredValues * Fr.SIZE_IN_BYTES,
      remainingData.length,
    );
    if (publicValuesData.length % Fr.SIZE_IN_BYTES !== 0) {
      throw new Error(`Public values byte length is not a multiple of Fr size. Length: ${publicValuesData.length}`);
    }
    const publicValues = [];
    for (let i = 0; i < publicValuesData.length; i += Fr.SIZE_IN_BYTES) {
      publicValues.push(Fr.fromBuffer(publicValuesData.subarray(i, i + Fr.SIZE_IN_BYTES)));
    }

    const remainingCiphertext = remainingData.subarray(0, remainingData.length - publicValuesData.length);

    return [publicValues, remainingCiphertext];
  }
}
