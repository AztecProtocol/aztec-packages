import { AztecAddress, Fq, Fr, GeneratorIndex, GrumpkinPrivateKey, Point, type PublicKey } from '@aztec/circuits.js';
import { Grumpkin } from '@aztec/circuits.js/barretenberg';
import { poseidon2Hash } from '@aztec/foundation/crypto';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { EncryptedLogHeader } from './encrypted_log_header.js';
import { EncryptedLogIncomingBody } from './encrypted_log_incoming_body.js';
import { EncryptedLogOutgoingBody } from './encrypted_log_outgoing_body.js';
import { type L1NotePayload } from './l1_note_payload/l1_note_payload.js';
import { Note } from './l1_note_payload/note.js';

const PLACEHOLDER_TAG = new Fr(33);

const grumpkin = new Grumpkin();

const HEADER_SIZE = 48; // 32 bytes + 16 bytes padding. (address)
const OUTGOING_BODY_SIZE = 176; // 160 bytes + 16 bytes padding. (secret key | address | public key)

export class EncryptedLogPayload {
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
     * Storage slot of the contract this tx is interacting with.
     */
    public storageSlot: Fr,
    /**
     * Type identifier for the underlying note, required to determine how to compute its hash and nullifier.
     */
    public noteTypeId: Fr,
  ) {}

  toBuffer() {
    return serializeToBuffer([this.note, this.contractAddress, this.storageSlot, this.noteTypeId]);
  }

  static fromBuffer(buffer: Buffer | BufferReader): EncryptedLogPayload {
    const reader = BufferReader.asReader(buffer);
    return new EncryptedLogPayload(
      reader.readObject(Note),
      reader.readObject(AztecAddress),
      Fr.fromBuffer(reader),
      Fr.fromBuffer(reader),
    );
  }

  static fromL1NotePayload(l1NotePayload: L1NotePayload) {
    return new EncryptedLogPayload(
      l1NotePayload.note,
      l1NotePayload.contractAddress,
      l1NotePayload.storageSlot,
      l1NotePayload.noteTypeId,
    );
  }

  public encrypt(ephSk: GrumpkinPrivateKey, recipient: AztecAddress, ivpk: PublicKey, ovsk: GrumpkinPrivateKey) {
    const ephPk = grumpkin.mul(Grumpkin.generator, ephSk);
    const ovpk = grumpkin.mul(Grumpkin.generator, ovsk);

    const header = new EncryptedLogHeader(this.contractAddress);

    const incomingHeaderCiphertext = header.computeCiphertext(ephSk, ivpk);
    const outgoingHeaderCiphertext = header.computeCiphertext(ephSk, ovpk);

    const ivpkApp = EncryptedLogPayload.computeIvpkApp(ivpk, this.contractAddress);

    const incomingBodyCiphertext = new EncryptedLogIncomingBody(
      this.storageSlot,
      this.noteTypeId,
      this.note,
    ).computeCiphertext(ephSk, ivpkApp);

    const ovskApp = EncryptedLogPayload.computeOvskApp(ovsk, this.contractAddress);

    const outgoingBodyCiphertext = new EncryptedLogOutgoingBody(ephSk, recipient, ivpkApp).computeCiphertext(
      ovskApp,
      ephPk,
    );

    return Buffer.concat([
      PLACEHOLDER_TAG.toBuffer(),
      PLACEHOLDER_TAG.toBuffer(),
      ephPk.toBuffer(),
      incomingHeaderCiphertext,
      outgoingHeaderCiphertext,
      outgoingBodyCiphertext,
      incomingBodyCiphertext,
    ]);
  }

  public static decryptAsIncoming(ciphertext: Buffer | bigint[], ivsk: GrumpkinPrivateKey) {
    const input = Buffer.isBuffer(ciphertext) ? ciphertext : Buffer.from(ciphertext.map((x: bigint) => Number(x)));
    const reader = BufferReader.asReader(input);

    // We don't use the tags as part of the decryption here, we just gotta read to skip them.
    reader.readObject(Fr); // incoming tag
    reader.readObject(Fr); // outgoing tag

    const ephPk = reader.readObject(Point);

    const incomingHeader = EncryptedLogHeader.fromCiphertext(reader.readBytes(HEADER_SIZE), ivsk, ephPk);

    // Skipping outgoing
    reader.readBytes(HEADER_SIZE);
    reader.readBytes(OUTGOING_BODY_SIZE);

    // The incoming can be of variable size, so we read until the end
    const incomingBodySlice = reader.readToEnd();

    const ivskApp = EncryptedLogPayload.computeIvskApp(ivsk, incomingHeader.address);
    const incomingBody = EncryptedLogIncomingBody.fromCiphertext(incomingBodySlice, ivskApp, ephPk);

    return new EncryptedLogPayload(
      incomingBody.note,
      incomingHeader.address,
      incomingBody.storageSlot,
      incomingBody.noteTypeId,
    );
  }

  public static decryptAsOutgoing(ciphertext: Buffer | bigint[], ovsk: GrumpkinPrivateKey) {
    const input = Buffer.isBuffer(ciphertext) ? ciphertext : Buffer.from(ciphertext.map((x: bigint) => Number(x)));
    const reader = BufferReader.asReader(input);

    // We don't use the tags as part of the decryption here, we just gotta read to skip them.
    reader.readObject(Fr); // incoming tag
    reader.readObject(Fr); // outgoing tag

    const ephPk = reader.readObject(Point);

    // Skip the incoming header
    reader.readBytes(HEADER_SIZE);

    // Skipping outgoing
    const outgoingHeader = EncryptedLogHeader.fromCiphertext(reader.readBytes(HEADER_SIZE), ovsk, ephPk);

    const ovskApp = EncryptedLogPayload.computeOvskApp(ovsk, outgoingHeader.address);
    const outgoingBody = EncryptedLogOutgoingBody.fromCiphertext(reader.readBytes(OUTGOING_BODY_SIZE), ovskApp, ephPk);

    // The incoming can be of variable size, so we read until the end
    const incomingBodySlice = reader.readToEnd();

    const incomingBody = EncryptedLogIncomingBody.fromCiphertext(
      incomingBodySlice,
      outgoingBody.ephSk,
      outgoingBody.recipientIvpkApp,
    );

    return new EncryptedLogPayload(
      incomingBody.note,
      outgoingHeader.address,
      incomingBody.storageSlot,
      incomingBody.noteTypeId,
    );
  }

  static computeIvpkApp(ivpk: PublicKey, address: AztecAddress) {
    const I = Fq.fromBuffer(poseidon2Hash([address.toField(), ivpk.x, ivpk.y, GeneratorIndex.IVSK_M]).toBuffer());
    return grumpkin.add(grumpkin.mul(Grumpkin.generator, I), ivpk);
  }

  static computeIvskApp(ivsk: GrumpkinPrivateKey, address: AztecAddress) {
    const ivpk = grumpkin.mul(Grumpkin.generator, ivsk);
    const I = Fq.fromBuffer(poseidon2Hash([address.toField(), ivpk.x, ivpk.y, GeneratorIndex.IVSK_M]).toBuffer());
    return new Fq((I.toBigInt() + ivsk.toBigInt()) % Fq.MODULUS);
  }

  static computeOvskApp(ovsk: GrumpkinPrivateKey, address: AztecAddress) {
    return GrumpkinPrivateKey.fromBuffer(
      poseidon2Hash([address.toField(), ovsk.high, ovsk.low, GeneratorIndex.OVSK_M]).toBuffer(),
    );
  }
}
