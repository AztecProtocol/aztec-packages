import {
  AztecAddress,
  Fr,
  GrumpkinScalar,
  type KeyValidationRequest,
  NotOnCurveError,
  Point,
  type PublicKey,
  computeOvskApp,
  derivePublicKeyFromSecretKey,
} from '@aztec/circuits.js';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { decrypt, encrypt } from './encryption_util.js';
import { derivePoseidonAESSecret } from './shared_secret_derivation.js';

// Both the incoming and the outgoing header are 48 bytes../shared_secret_derivation.js
// 32 bytes for the address, and 16 bytes padding to follow PKCS#7
const HEADER_SIZE = 48;

// The outgoing body is constant size of 144 bytes.
// 128 bytes for the secret key, address and public key, and 16 bytes padding to follow PKCS#7
const OUTGOING_BODY_SIZE = 144;

/**
 * Encrypted log payload with a tag used for retrieval by clients.
 */
export class EncryptedLogPayload {
  constructor(
    public readonly incomingTag: Fr,
    public readonly outgoingTag: Fr,
    public readonly contractAddress: AztecAddress,
    public readonly incomingBodyPlaintext: Buffer,
  ) {}

  public encrypt(
    ephSk: GrumpkinScalar,
    recipient: AztecAddress,
    ivpk: PublicKey,
    ovKeys: KeyValidationRequest,
  ): Buffer {
    if (ivpk.isZero()) {
      throw new Error(`Attempting to encrypt an event log with a zero ivpk.`);
    }

    const ephPk = derivePublicKeyFromSecretKey(ephSk);
    const incomingHeaderCiphertext = encrypt(this.contractAddress.toBuffer(), ephSk, ivpk);
    const outgoingHeaderCiphertext = encrypt(this.contractAddress.toBuffer(), ephSk, ovKeys.pkM);

    if (incomingHeaderCiphertext.length !== HEADER_SIZE) {
      throw new Error(`Invalid incoming header size: ${incomingHeaderCiphertext.length}`);
    }
    if (outgoingHeaderCiphertext.length !== HEADER_SIZE) {
      throw new Error(`Invalid outgoing header size: ${outgoingHeaderCiphertext.length}`);
    }

    const incomingBodyCiphertext = encrypt(this.incomingBodyPlaintext, ephSk, ivpk);
    // The serialization of Fq is [high, low] check `outgoing_body.nr`
    const outgoingBodyPlaintext = serializeToBuffer(ephSk.hi, ephSk.lo, recipient, ivpk.toCompressedBuffer());
    const outgoingBodyCiphertext = encrypt(
      outgoingBodyPlaintext,
      ovKeys.skAppAsGrumpkinScalar,
      ephPk,
      derivePoseidonAESSecret,
    );

    if (outgoingBodyCiphertext.length !== OUTGOING_BODY_SIZE) {
      throw new Error(`Invalid outgoing body size: ${outgoingBodyCiphertext.length}`);
    }

    return serializeToBuffer(
      this.incomingTag,
      this.outgoingTag,
      ephPk.toCompressedBuffer(),
      incomingHeaderCiphertext,
      outgoingHeaderCiphertext,
      outgoingBodyCiphertext,
      incomingBodyCiphertext,
    );
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
  public static decryptAsIncoming(
    ciphertext: Buffer | BufferReader,
    ivsk: GrumpkinScalar,
  ): EncryptedLogPayload | undefined {
    const reader = BufferReader.asReader(ciphertext);

    try {
      const incomingTag = reader.readObject(Fr);
      const outgoingTag = reader.readObject(Fr);

      const ephPk = Point.fromCompressedBuffer(reader.readBytes(Point.COMPRESSED_SIZE_IN_BYTES));

      const incomingHeader = decrypt(reader.readBytes(HEADER_SIZE), ivsk, ephPk);

      // Skipping the outgoing header and body
      reader.readBytes(HEADER_SIZE);
      reader.readBytes(OUTGOING_BODY_SIZE);

      // The incoming can be of variable size, so we read until the end
      const incomingBodyPlaintext = decrypt(reader.readToEnd(), ivsk, ephPk);

      return new EncryptedLogPayload(
        incomingTag,
        outgoingTag,
        AztecAddress.fromBuffer(incomingHeader),
        incomingBodyPlaintext,
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
      const incomingTag = reader.readObject(Fr);
      const outgoingTag = reader.readObject(Fr);

      const ephPk = Point.fromCompressedBuffer(reader.readBytes(Point.COMPRESSED_SIZE_IN_BYTES));

      // We skip the incoming header
      reader.readBytes(HEADER_SIZE);

      const outgoingHeader = decrypt(reader.readBytes(HEADER_SIZE), ovsk, ephPk);
      const contractAddress = AztecAddress.fromBuffer(outgoingHeader);

      const ovskApp = computeOvskApp(ovsk, contractAddress);

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
      const incomingBody = decrypt(reader.readToEnd(), ephSk, recipientIvpk);

      return new EncryptedLogPayload(incomingTag, outgoingTag, contractAddress, incomingBody);
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

  public toBuffer() {
    return serializeToBuffer(
      this.incomingTag,
      this.outgoingTag,
      this.contractAddress.toBuffer(),
      this.incomingBodyPlaintext,
    );
  }
}
