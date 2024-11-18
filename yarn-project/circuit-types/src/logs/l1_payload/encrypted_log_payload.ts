import {
  AztecAddress,
  Fq,
  Fr,
  type GrumpkinScalar,
  type KeyValidationRequest,
  MAX_PRIVATE_LOG_SIZE_IN_BYTES,
  NotOnCurveError,
  Point,
  type PublicKey,
  computeOvskApp,
  computePoint,
  derivePublicKeyFromSecretKey,
} from '@aztec/circuits.js';
import { randomBytes } from '@aztec/foundation/crypto';
import { BufferReader, numToUInt16BE, serializeToBuffer } from '@aztec/foundation/serialize';

import { decrypt, encrypt } from './encryption_util.js';
import { derivePoseidonAESSecret } from './shared_secret_derivation.js';

// Both the incoming and the outgoing header are 48 bytes../shared_secret_derivation.js
// 32 bytes for the address, and 16 bytes padding to follow PKCS#7
const HEADER_SIZE = 48;

// The outgoing body is constant size:
// 96 bytes for the secret key, address and public key, and 16 bytes padding to follow PKCS#7
const OUTGOING_BODY_SIZE = 112;

// Padding added to the overhead to make the size of the incoming body ciphertext a multiple of 16.
const OVERHEAD_PADDING = 14;

const ENCRYPTED_LOG_CIPHERTEXT_OVERHEAD_SIZE =
  32 /* incoming_tag */ +
  32 /* eph_pk */ +
  HEADER_SIZE /* incoming_header */ +
  HEADER_SIZE /* outgoing_header */ +
  OUTGOING_BODY_SIZE /* outgoing_body */ +
  OVERHEAD_PADDING; /* padding */

export const MAX_INCOMING_BODY_SIZE = MAX_PRIVATE_LOG_SIZE_IN_BYTES - ENCRYPTED_LOG_CIPHERTEXT_OVERHEAD_SIZE;

/**
 * Encrypted log payload with a tag used for retrieval by clients.
 */
export class EncryptedLogPayload {
  constructor(
    /**
     * Note discovery tag.
     */
    public readonly tag: Fr,
    /**
     * Address of a contract that emitted the log.
     */
    public readonly contractAddress: AztecAddress,
    /**
     * Decrypted incoming body.
     */
    public readonly incomingBodyPlaintext: Buffer,
  ) {}

  public encrypt(
    ephSk: GrumpkinScalar,
    recipient: AztecAddress,
    ovKeys: KeyValidationRequest,
    incomingBodyCiphertextSize = MAX_INCOMING_BODY_SIZE,
    rand: (len: number) => Buffer = randomBytes,
  ): Buffer {
    const addressPoint = computePoint(recipient);

    const ephPk = derivePublicKeyFromSecretKey(ephSk);
    const incomingHeaderCiphertext = encrypt(this.contractAddress.toBuffer(), ephSk, addressPoint);
    const outgoingHeaderCiphertext = encrypt(this.contractAddress.toBuffer(), ephSk, ovKeys.pkM);

    if (incomingHeaderCiphertext.length !== HEADER_SIZE) {
      throw new Error(`Invalid incoming header size: ${incomingHeaderCiphertext.length}`);
    }
    if (outgoingHeaderCiphertext.length !== HEADER_SIZE) {
      throw new Error(`Invalid outgoing header size: ${outgoingHeaderCiphertext.length}`);
    }

    const outgoingBodyCiphertext = EncryptedLogPayload.encryptOutgoingBody(
      ephSk,
      ephPk,
      recipient,
      addressPoint,
      ovKeys.skAppAsGrumpkinScalar,
    );

    const overhead = serializeToBuffer(
      this.tag,
      ephPk.toCompressedBuffer(),
      incomingHeaderCiphertext,
      outgoingHeaderCiphertext,
      outgoingBodyCiphertext,
      Buffer.alloc(OVERHEAD_PADDING),
    );
    if (overhead.length !== ENCRYPTED_LOG_CIPHERTEXT_OVERHEAD_SIZE) {
      throw new Error(
        `Invalid ciphertext overhead size. Expected ${ENCRYPTED_LOG_CIPHERTEXT_OVERHEAD_SIZE}. Got ${overhead.length}.`,
      );
    }

    if (incomingBodyCiphertextSize > MAX_INCOMING_BODY_SIZE) {
      throw new Error(`Incoming body ciphertext cannot be more than ${MAX_INCOMING_BODY_SIZE} bytes.`);
    }
    if (incomingBodyCiphertextSize % 16) {
      throw new Error(`Incoming body ciphertext must be a multiple of 16 bytes.`);
    }

    const maxPlaintextSize =
      incomingBodyCiphertextSize - 2 /* 2 bytes for this.incomingBodyPlaintext.length */ - 1; /* aes padding */
    if (this.incomingBodyPlaintext.length > maxPlaintextSize) {
      throw new Error(
        `Incoming body plaintext cannot be more than ${maxPlaintextSize} bytes to generate a ciphertext of ${incomingBodyCiphertextSize} bytes.`,
      );
    }

    const numPaddedBytes = maxPlaintextSize - this.incomingBodyPlaintext.length;
    const paddedIncomingBodyPlaintextWithLength = Buffer.concat([
      numToUInt16BE(this.incomingBodyPlaintext.length),
      this.incomingBodyPlaintext,
      rand(numPaddedBytes),
    ]);
    const incomingBodyCiphertext = encrypt(paddedIncomingBodyPlaintextWithLength, ephSk, addressPoint);
    if (incomingBodyCiphertext.length !== incomingBodyCiphertextSize) {
      throw new Error(
        `Invalid encrypted incoming body size. Expected ${incomingBodyCiphertextSize}. Got ${incomingBodyCiphertext.length}`,
      );
    }

    return serializeToBuffer(overhead, incomingBodyCiphertext);
  }

  public static encryptOutgoingBody(
    ephSk: GrumpkinScalar,
    ephPk: Point,
    recipient: AztecAddress,
    addressPoint: Point,
    secret: GrumpkinScalar,
  ) {
    const outgoingBodyPlaintext = serializeToBuffer(ephSk, recipient, addressPoint.toCompressedBuffer());
    const outgoingBodyCiphertext = encrypt(outgoingBodyPlaintext, secret, ephPk, derivePoseidonAESSecret);
    if (outgoingBodyCiphertext.length !== OUTGOING_BODY_SIZE) {
      throw new Error(`Invalid outgoing body size: ${outgoingBodyCiphertext.length}`);
    }
    return outgoingBodyCiphertext;
  }

  /**
   * Decrypts a ciphertext as an incoming log.
   *
   * This is executable by the recipient of the note, and uses the addressSecret to decrypt the payload.
   * The outgoing parts of the log are ignored entirely.
   *
   * Produces the same output as `decryptAsOutgoing`.
   *
   * @param ciphertext - The ciphertext for the log
   * @param addressSecret - The address secret, used to decrypt the logs
   * @returns The decrypted log payload
   */
  public static decryptAsIncoming(
    ciphertext: Buffer | BufferReader,
    addressSecret: GrumpkinScalar,
  ): EncryptedLogPayload | undefined {
    const reader = BufferReader.asReader(ciphertext);

    try {
      const tag = reader.readObject(Fr);

      const ephPk = Point.fromCompressedBuffer(reader.readBytes(Point.COMPRESSED_SIZE_IN_BYTES));

      const incomingHeader = decrypt(reader.readBytes(HEADER_SIZE), addressSecret, ephPk);

      // Skipping the outgoing header and body
      reader.readBytes(HEADER_SIZE);
      reader.readBytes(OUTGOING_BODY_SIZE);

      // Skip the padding.
      reader.readBytes(OVERHEAD_PADDING);

      // The incoming can be of variable size, so we read until the end
      const ciphertext = reader.readToEnd();
      const decrypted = decrypt(ciphertext, addressSecret, ephPk);
      const length = decrypted.readUint16BE(0);
      const incomingBodyPlaintext = decrypted.subarray(2, 2 + length);

      return new EncryptedLogPayload(tag, AztecAddress.fromBuffer(incomingHeader), incomingBodyPlaintext);
    } catch (e: any) {
      // Following error messages are expected to occur when decryption fails
      if (!this.isAcceptableError(e)) {
        // If we encounter an unexpected error, we rethrow it
        throw e;
      }
      return;
    }
  }

  /**
   * Decrypts a ciphertext as an outgoing log.
   *
   * This is executable by the sender of the event, and uses the ovsk to decrypt the payload.
   * The outgoing parts are decrypted to retrieve information that allows the sender to
   * decrypt the incoming log, and learn about the event contents.
   *
   * Produces the same output as `decryptAsIncoming`.
   *
   * @param ciphertext - The ciphertext for the log
   * @param ovsk - The outgoing viewing secret key, used to decrypt the logs
   * @returns The decrypted log payload
   */
  public static decryptAsOutgoing(
    ciphertext: Buffer | BufferReader,
    ovsk: GrumpkinScalar,
  ): EncryptedLogPayload | undefined {
    const reader = BufferReader.asReader(ciphertext);

    try {
      const tag = reader.readObject(Fr);

      const ephPk = Point.fromCompressedBuffer(reader.readBytes(Point.COMPRESSED_SIZE_IN_BYTES));

      // We skip the incoming header
      reader.readBytes(HEADER_SIZE);

      const outgoingHeader = decrypt(reader.readBytes(HEADER_SIZE), ovsk, ephPk);
      const contractAddress = AztecAddress.fromBuffer(outgoingHeader);

      const ovskApp = computeOvskApp(ovsk, contractAddress);

      let ephSk: GrumpkinScalar;
      let recipientAddressPoint: PublicKey;
      {
        const outgoingBody = decrypt(reader.readBytes(OUTGOING_BODY_SIZE), ovskApp, ephPk, derivePoseidonAESSecret);
        const obReader = BufferReader.asReader(outgoingBody);

        // From outgoing body we extract ephSk, recipient and recipientAddressPoint
        ephSk = obReader.readObject(Fq);
        const _recipient = obReader.readObject(AztecAddress);
        recipientAddressPoint = Point.fromCompressedBuffer(obReader.readBytes(Point.COMPRESSED_SIZE_IN_BYTES));
      }

      // Skip the padding.
      reader.readBytes(OVERHEAD_PADDING);

      // Now we decrypt the incoming body using the ephSk and recipientIvpk
      const decryptedIncomingBody = decrypt(reader.readToEnd(), ephSk, recipientAddressPoint);
      const length = decryptedIncomingBody.readUint16BE(0);
      const incomingBody = decryptedIncomingBody.subarray(2, 2 + length);

      return new EncryptedLogPayload(tag, contractAddress, incomingBody);
    } catch (e: any) {
      // Following error messages are expected to occur when decryption fails
      if (!this.isAcceptableError(e)) {
        // If we encounter an unexpected error, we rethrow it
        throw e;
      }
      return;
    }
  }

  private static isAcceptableError(e: any) {
    return (
      e instanceof NotOnCurveError ||
      e.message.endsWith('is greater or equal to field modulus.') ||
      e.message.startsWith('Invalid AztecAddress length') ||
      e.message.startsWith('Selector must fit in') ||
      e.message.startsWith('Attempted to read beyond buffer length') ||
      e.message.startsWith('RangeError [ERR_BUFFER_OUT_OF_BOUNDS]:')
    );
  }

  public toBuffer() {
    return serializeToBuffer(this.tag, this.contractAddress.toBuffer(), this.incomingBodyPlaintext);
  }
}
