import { AztecAddress, type PublicKey, computeOvskApp } from '@aztec/circuits.js';
import { NoteSelector } from '@aztec/foundation/abi';
import { randomInt } from '@aztec/foundation/crypto';
import { type Fq, Fr, GrumpkinScalar, NotOnCurveError, Point } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { HEADER_SIZE, OUTGOING_BODY_SIZE } from './encrypted_log_payload.js';
import { decrypt } from './encryption_util.js';
import { Note } from './payload.js';
import { derivePoseidonAESSecret } from './shared_secret_derivation.js';

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
    /**
     * Values appended to the note log in public.
     */
    public publicValues: Fr[],
  ) {}

  static fromIncomingBodyPlaintextContractAddressAndPublicValues(
    plaintext: Buffer,
    contractAddress: AztecAddress,
    publicValues: Fr[],
  ): L1NotePayload | undefined {
    try {
      const reader = BufferReader.asReader(plaintext);
      const fields = reader.readArray(plaintext.length / Fr.SIZE_IN_BYTES, Fr);

      const storageSlot = fields[0];
      const noteTypeId = NoteSelector.fromField(fields[1]);

      const note = new Note(fields.slice(2));

      return new L1NotePayload(note, contractAddress, storageSlot, noteTypeId, publicValues);
    } catch (e) {
      return undefined;
    }
  }

  static async decryptAsIncoming(
    log: Buffer,
    sk: Fq,
    // I am aware that having the getter here as quite a trash code but this will be refactored with the big PXE refactor and all
    // the alternatives are bad so I am learning to live with it.
    numPublicValuesGetter: (contractAddress: AztecAddress) => Promise<number>,
  ): Promise<L1NotePayload | undefined> {
    const reader = BufferReader.asReader(log);

    try {
      const publicValuesAppended = reader.readBoolean();

      const _incomingTag = reader.readObject(Fr);
      const _outgoingTag = reader.readObject(Fr);

      const ephPk = Point.fromCompressedBuffer(reader.readBytes(Point.COMPRESSED_SIZE_IN_BYTES));

      const incomingHeader = decrypt(reader.readBytes(HEADER_SIZE), sk, ephPk);
      const contractAddress = AztecAddress.fromBuffer(incomingHeader);

      // Skipping the outgoing header and body
      reader.readBytes(HEADER_SIZE);
      reader.readBytes(OUTGOING_BODY_SIZE);

      // The incoming can be of variable size, so we read until the end
      let numPublicValues = 0;
      if (publicValuesAppended) {
        numPublicValues = await numPublicValuesGetter(contractAddress);
      }

      const incomingBodyCiphertext = reader.readBytes(reader.remainingBytes() - numPublicValues * Fr.SIZE_IN_BYTES);
      const incomingBodyPlaintext = decrypt(incomingBodyCiphertext, sk, ephPk);

      const publicValues = reader.readArray(numPublicValues, Fr);

      return this.fromIncomingBodyPlaintextContractAddressAndPublicValues(
        incomingBodyPlaintext,
        contractAddress,
        publicValues,
      );
    } catch (e: any) {
      // Following error messages are expected to occur when decryption fails
      if (
        !(e instanceof NotOnCurveError) &&
        !e.message.endsWith('is greater or equal to field modulus.') &&
        !e.message.startsWith('Invalid AztecAddress length') &&
        !e.message.startsWith('Selector must fit in') &&
        !e.message.startsWith('Attempted to read beyond buffer length')
      ) {
        // If we encounter an unexpected error, we rethrow it
        throw e;
      }
      return;
    }
  }

  static async decryptAsOutgoing(
    log: Buffer,
    sk: Fq, // I am aware that having the getter here as quite a trash code but this will be refactored with the big PXE refactor and all
    // the alternatives are bad so I am learning to live with it.
    numPublicValuesGetter: (contractAddress: AztecAddress) => Promise<number>,
  ): Promise<L1NotePayload | undefined> {
    const reader = BufferReader.asReader(log);

    try {
      const publicValuesAppended = reader.readBoolean();

      const _incomingTag = reader.readObject(Fr);
      const _outgoingTag = reader.readObject(Fr);

      const ephPk = Point.fromCompressedBuffer(reader.readBytes(Point.COMPRESSED_SIZE_IN_BYTES));

      // We skip the incoming header
      reader.readBytes(HEADER_SIZE);

      const outgoingHeader = decrypt(reader.readBytes(HEADER_SIZE), sk, ephPk);
      const contractAddress = AztecAddress.fromBuffer(outgoingHeader);

      const ovskApp = computeOvskApp(sk, contractAddress);

      let ephSk: GrumpkinScalar;
      let recipientIvpk: PublicKey;
      {
        const outgoingBody = decrypt(reader.readBytes(OUTGOING_BODY_SIZE), ovskApp, ephPk, derivePoseidonAESSecret);
        const obReader = BufferReader.asReader(outgoingBody);

        // From outgoing body we extract ephSk, recipient and recipientIvpk
        ephSk = GrumpkinScalar.fromHighLow(obReader.readObject(Fr), obReader.readObject(Fr));
        const _recipient = obReader.readObject(AztecAddress);
        recipientIvpk = Point.fromCompressedBuffer(obReader.readBytes(Point.COMPRESSED_SIZE_IN_BYTES));
      }

      // Now we decrypt the incoming body using the ephSk and recipientIvpk
      let numPublicValues = 0;
      if (publicValuesAppended) {
        numPublicValues = await numPublicValuesGetter(contractAddress);
      }

      const incomingBodyCiphertext = reader.readBytes(reader.remainingBytes() - numPublicValues * Fr.SIZE_IN_BYTES);
      const incomingBodyPlaintext = decrypt(incomingBodyCiphertext, ephSk, recipientIvpk);

      const publicValues = reader.readArray(numPublicValues, Fr);

      return this.fromIncomingBodyPlaintextContractAddressAndPublicValues(
        incomingBodyPlaintext,
        contractAddress,
        publicValues,
      );
    } catch (e: any) {
      // Following error messages are expected to occur when decryption fails
      if (
        !(e instanceof NotOnCurveError) &&
        !e.message.endsWith('is greater or equal to field modulus.') &&
        !e.message.startsWith('Invalid AztecAddress length') &&
        !e.message.startsWith('Selector must fit in') &&
        !e.message.startsWith('Attempted to read beyond buffer length')
      ) {
        // If we encounter an unexpected error, we rethrow it
        throw e;
      }
      return;
    }
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
    const numPublicValues = randomInt(3);
    const publicValues = Array.from({ length: numPublicValues }, () => Fr.random());
    return new L1NotePayload(Note.random(), contract, Fr.random(), NoteSelector.random(), publicValues);
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
