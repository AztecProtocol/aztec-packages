import {
  AztecAddress,
  Fr,
  type GrumpkinScalar,
  NotOnCurveError,
  PRIVATE_LOG_SIZE_IN_FIELDS,
  Point,
  PrivateLog,
  type PublicKey,
  derivePublicKeyFromSecretKey,
} from '@aztec/circuits.js';
import { randomBytes } from '@aztec/foundation/crypto';
import { BufferReader, type Tuple, numToUInt16BE, serializeToBuffer } from '@aztec/foundation/serialize';

import { decrypt, encrypt } from './encryption_util.js';

// Below constants should match the values defined in aztec-nr/aztec/src/encrypted_logs/payload.nr.

const ENCRYPTED_PAYLOAD_SIZE_IN_BYTES = (PRIVATE_LOG_SIZE_IN_FIELDS - 1) * 31;

// The incoming header is 48 bytes../shared_secret_derivation.js
// 32 bytes for the address, and 16 bytes padding to follow PKCS#7
const HEADER_SIZE = 48;

// Padding added to the overhead to make the size of the incoming body ciphertext a multiple of 16.
const OVERHEAD_PADDING = 15;

const OVERHEAD_SIZE =
  32 /* eph_pk */ +
  HEADER_SIZE /* incoming_header */ +
  OVERHEAD_PADDING; /* padding */

const PLAINTEXT_LENGTH_SIZE = 2;

const MAX_PRIVATE_LOG_PLAINTEXT_SIZE_IN_BYTES =
  ENCRYPTED_PAYLOAD_SIZE_IN_BYTES - OVERHEAD_SIZE - PLAINTEXT_LENGTH_SIZE - 1; /* aes padding */

function encryptedBytesToFields(encrypted: Buffer): Fr[] {
  const fields = [];
  const numFields = Math.ceil(encrypted.length / 31);
  for (let i = 0; i < numFields; i++) {
    fields.push(new Fr(encrypted.subarray(i * 31, (i + 1) * 31)));
  }
  return fields;
}

function fieldsToEncryptedBytes(fields: Fr[]) {
  return Buffer.concat(fields.map(f => f.toBuffer().subarray(1)));
}

class Overhead {
  constructor(
    public ephPk: Point,
    public incomingHeader: Buffer,
  ) {}

  static fromBuffer(reader: BufferReader) {
    const ephPk = Point.fromCompressedBuffer(reader.readBytes(Point.COMPRESSED_SIZE_IN_BYTES));
    const incomingHeader = reader.readBytes(HEADER_SIZE);

    // Advance the index to skip the padding.
    reader.readBytes(OVERHEAD_PADDING);

    return new Overhead(ephPk, incomingHeader);
  }
}

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

  public generatePayload(
    ephSk: GrumpkinScalar,
    recipient: AztecAddress,
    rand: (len: number) => Buffer = randomBytes,
  ): PrivateLog {
    const addressPoint = recipient.toAddressPoint();

    const ephPk = derivePublicKeyFromSecretKey(ephSk);
    const incomingHeaderCiphertext = encrypt(this.contractAddress.toBuffer(), ephSk, addressPoint);

    if (incomingHeaderCiphertext.length !== HEADER_SIZE) {
      throw new Error(`Invalid incoming header size: ${incomingHeaderCiphertext.length}`);
    }

    const overhead = serializeToBuffer(
      ephPk.toCompressedBuffer(),
      incomingHeaderCiphertext,
      Buffer.alloc(OVERHEAD_PADDING),
    );
    if (overhead.length !== OVERHEAD_SIZE) {
      throw new Error(`Invalid ciphertext overhead size. Expected ${OVERHEAD_SIZE}. Got ${overhead.length}.`);
    }

    if (this.incomingBodyPlaintext.length > MAX_PRIVATE_LOG_PLAINTEXT_SIZE_IN_BYTES) {
      throw new Error(`Incoming body plaintext cannot be more than ${MAX_PRIVATE_LOG_PLAINTEXT_SIZE_IN_BYTES} bytes.`);
    }

    const numPaddedBytes = MAX_PRIVATE_LOG_PLAINTEXT_SIZE_IN_BYTES - this.incomingBodyPlaintext.length;
    const paddedIncomingBodyPlaintextWithLength = Buffer.concat([
      numToUInt16BE(this.incomingBodyPlaintext.length),
      this.incomingBodyPlaintext,
      rand(numPaddedBytes),
    ]);
    const incomingBodyCiphertext = encrypt(paddedIncomingBodyPlaintextWithLength, ephSk, addressPoint);

    const encryptedPayload = serializeToBuffer(overhead, incomingBodyCiphertext);

    const logFields = [this.tag, ...encryptedBytesToFields(encryptedPayload)] as Tuple<
      Fr,
      typeof PRIVATE_LOG_SIZE_IN_FIELDS
    >;
    if (logFields.length !== PRIVATE_LOG_SIZE_IN_FIELDS) {
      throw new Error(
        `Expected private log payload to have ${PRIVATE_LOG_SIZE_IN_FIELDS} fields. Got ${logFields.length}.`,
      );
    }

    return new PrivateLog(logFields);
  }

  /**
   * Decrypts a ciphertext as an incoming log.
   *
   * This is executable by the recipient of the note, and uses the addressSecret to decrypt the payload.
   *
   * @param payload - The payload for the log
   * @param addressSecret - The address secret, used to decrypt the logs
   * @returns The decrypted log payload
   */
  public static decryptAsIncoming(payload: PrivateLog, addressSecret: GrumpkinScalar): EncryptedLogPayload | undefined {
    try {
      const logFields = payload.fields;
      const tag = logFields[0];
      const reader = BufferReader.asReader(fieldsToEncryptedBytes(logFields.slice(1)));

      const overhead = Overhead.fromBuffer(reader);
      const { contractAddress } = this.#decryptOverhead(overhead, { addressSecret });

      const ciphertext = reader.readToEnd();
      const incomingBodyPlaintext = this.#decryptIncomingBody(ciphertext, addressSecret, overhead.ephPk);

      return new EncryptedLogPayload(tag, contractAddress, incomingBodyPlaintext);
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
   * Similar to `decryptAsIncoming`. Except that this is for the payload coming from public, which has tightly packed
   * bytes that don't have 0 byte at the beginning of every 32 bytes.
   * And the incoming body is of variable size.
   */
  public static decryptAsIncomingFromPublic(
    payload: Buffer,
    addressSecret: GrumpkinScalar,
  ): EncryptedLogPayload | undefined {
    try {
      const reader = BufferReader.asReader(payload);
      const tag = reader.readObject(Fr);

      const overhead = Overhead.fromBuffer(reader);
      const { contractAddress } = this.#decryptOverhead(overhead, { addressSecret });

      // The incoming can be of variable size, so we read until the end
      const ciphertext = reader.readToEnd();
      const incomingBodyPlaintext = this.#decryptIncomingBody(ciphertext, addressSecret, overhead.ephPk);

      return new EncryptedLogPayload(tag, contractAddress, incomingBodyPlaintext);
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

  static #decryptOverhead(
    overhead: Overhead,
    { addressSecret }: { addressSecret: GrumpkinScalar },
  ) {
    let contractAddress = AztecAddress.ZERO;

    if (addressSecret) {
      const incomingHeader = decrypt(overhead.incomingHeader, addressSecret, overhead.ephPk);
      contractAddress = AztecAddress.fromBuffer(incomingHeader);
    }

    return {
      contractAddress,
    };
  }

  static #decryptIncomingBody(ciphertext: Buffer, secret: GrumpkinScalar, publicKey: PublicKey) {
    const decrypted = decrypt(ciphertext, secret, publicKey);
    const length = decrypted.readUint16BE(0);
    return decrypted.subarray(2, 2 + length);
  }
}
