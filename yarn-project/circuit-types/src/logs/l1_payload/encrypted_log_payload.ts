import {
  AztecAddress,
  Fr,
  GrumpkinScalar,
  type KeyValidationRequest,
  NotOnCurveError,
  PRIVATE_LOG_SIZE_IN_BYTES,
  Point,
  type PublicKey,
  computeOvskApp,
  derivePublicKeyFromSecretKey,
} from '@aztec/circuits.js';
import { randomBytes } from '@aztec/foundation/crypto';
import { BufferReader, numToUInt8, serializeToBuffer } from '@aztec/foundation/serialize';

import { decrypt, encrypt } from './encryption_util.js';
import { derivePoseidonAESSecret } from './shared_secret_derivation.js';

// Both the incoming and the outgoing header are 48 bytes../shared_secret_derivation.js
// 32 bytes for the address, and 16 bytes padding to follow PKCS#7
const HEADER_SIZE = 48;

// The outgoing body is constant size of 144 bytes.
// 128 bytes for the secret key, address and public key, and 16 bytes padding to follow PKCS#7
const OUTGOING_BODY_SIZE = 144;

const ENCRYPTED_LOG_CIPHERTEXT_OVERHEAD_SIZE =
  32 /* incoming_tag */ +
  32 /* eph_pk */ +
  HEADER_SIZE /* incoming_header */ +
  HEADER_SIZE /* outgoing_header */ +
  OUTGOING_BODY_SIZE; /* outgoing_body */

const INCOMING_BODY_SIZE = PRIVATE_LOG_SIZE_IN_BYTES - ENCRYPTED_LOG_CIPHERTEXT_OVERHEAD_SIZE;

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
    rand: (len: number) => Buffer = randomBytes,
  ): Buffer {
    const addressPoint = recipient.toAddressPoint();

    const ephPk = derivePublicKeyFromSecretKey(ephSk);
    const incomingHeaderCiphertext = encrypt(this.contractAddress.toBuffer(), ephSk, addressPoint);
    const outgoingHeaderCiphertext = encrypt(this.contractAddress.toBuffer(), ephSk, ovKeys.pkM);

    if (incomingHeaderCiphertext.length !== HEADER_SIZE) {
      throw new Error(`Invalid incoming header size: ${incomingHeaderCiphertext.length}`);
    }
    if (outgoingHeaderCiphertext.length !== HEADER_SIZE) {
      throw new Error(`Invalid outgoing header size: ${outgoingHeaderCiphertext.length}`);
    }

    // The serialization of Fq is [high, low] check `outgoing_body.nr`
    const outgoingBodyPlaintext = serializeToBuffer(ephSk.hi, ephSk.lo, recipient, addressPoint.toCompressedBuffer());
    const outgoingBodyCiphertext = encrypt(
      outgoingBodyPlaintext,
      ovKeys.skAppAsGrumpkinScalar,
      ephPk,
      derivePoseidonAESSecret,
    );
    if (outgoingBodyCiphertext.length !== OUTGOING_BODY_SIZE) {
      throw new Error(`Invalid outgoing body size: ${outgoingBodyCiphertext.length}`);
    }

    const overhead = serializeToBuffer(
      this.tag,
      ephPk.toCompressedBuffer(),
      incomingHeaderCiphertext,
      outgoingHeaderCiphertext,
      outgoingBodyCiphertext,
    );
    if (overhead.length !== ENCRYPTED_LOG_CIPHERTEXT_OVERHEAD_SIZE) {
      throw new Error(
        `Invalid ciphertext overhead size. Expected ${ENCRYPTED_LOG_CIPHERTEXT_OVERHEAD_SIZE}. Got ${overhead.length}.`,
      );
    }

    const numPaddedBytes =
      PRIVATE_LOG_SIZE_IN_BYTES -
      ENCRYPTED_LOG_CIPHERTEXT_OVERHEAD_SIZE -
      1 /* 1 byte for this.incomingBodyPlaintext.length */ -
      15 /* aes padding */ -
      this.incomingBodyPlaintext.length;
    const paddedIncomingBodyPlaintextWithLength = Buffer.concat([
      numToUInt8(this.incomingBodyPlaintext.length),
      this.incomingBodyPlaintext,
      rand(numPaddedBytes),
    ]);
    const incomingBodyCiphertext = encrypt(paddedIncomingBodyPlaintextWithLength, ephSk, addressPoint);
    if (incomingBodyCiphertext.length !== INCOMING_BODY_SIZE) {
      throw new Error(
        `Invalid incoming body size. Expected ${INCOMING_BODY_SIZE}. Got ${incomingBodyCiphertext.length}`,
      );
    }

    return serializeToBuffer(overhead, incomingBodyCiphertext);
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

      // The incoming can be of variable size, so we read until the end
      const ciphertext = reader.readToEnd();
      const decrypted = decrypt(ciphertext, addressSecret, ephPk);
      const length = decrypted.readUint8(0);
      const incomingBodyPlaintext = decrypted.subarray(1, 1 + length);

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
        ephSk = GrumpkinScalar.fromHighLow(obReader.readObject(Fr), obReader.readObject(Fr));
        const _recipient = obReader.readObject(AztecAddress);
        recipientAddressPoint = Point.fromCompressedBuffer(obReader.readBytes(Point.COMPRESSED_SIZE_IN_BYTES));
      }

      // Now we decrypt the incoming body using the ephSk and recipientIvpk
      const decryptedIncomingBody = decrypt(reader.readToEnd(), ephSk, recipientAddressPoint);
      const length = decryptedIncomingBody.readUint8(0);
      const incomingBody = decryptedIncomingBody.subarray(1, 1 + length);

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
