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

// The incoming header is 48 bytes
// 32 bytes for the address, and 16 bytes padding to follow PKCS#7
const HEADER_SIZE = 48;

// Padding added to the overhead to make the size of the incoming body ciphertext a multiple of 16.
const OVERHEAD_PADDING = 15;

const OVERHEAD_SIZE = 32 /* eph_pk */ + HEADER_SIZE /* incoming_header */ + OVERHEAD_PADDING; /* padding */

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

function trimCiphertext(buf: Buffer, ciphertextLength: number) {
  // bytes_to_fields in nr pads fields smaller than 31 bytes, meaning fieldsToEncryptedBytes can give incorrect ciphertext
  // e.g. input
  //  Fr<0x003b1cb893d1fdab1d55420181669aa5251acc8beaed8438dca7960f217cfe1f>,
  //  Fr<0x00000000000000000000a3a3d57e7221e9bb201917f09caa475f2d00658e8f5e>
  // becomes: 3b1cb893d1fdab1d55420181669aa5251acc8beaed8438dca7960f217cfe1f00000000000000000a3a3d57e7221e9bb201917f09caa475f2d00658e8f5e
  // but should be: 3b1cb893d1fdab1d55420181669aa5251acc8beaed8438dca7960f217cfe1fa3a3d57e7221e9bb201917f09caa475f2d00658e8f5e
  // This fn trims the correct number of zeroes.
  const zeroesToTrim = buf.length - ciphertextLength;
  const finalFieldBytes = buf.subarray(-31).subarray(zeroesToTrim);
  const ciphertextBytes = Buffer.concat([buf.subarray(0, -31), finalFieldBytes]);
  return ciphertextBytes;
}

class Overhead {
  constructor(public ephPk: Point, public incomingHeader: Buffer) {}

  static async fromBuffer(reader: BufferReader) {
    const ephPk = await Point.fromCompressedBuffer(reader.readBytes(Point.COMPRESSED_SIZE_IN_BYTES));
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

  public async generatePayload(
    ephSk: GrumpkinScalar,
    recipient: AztecAddress,
    rand: (len: number) => Buffer = randomBytes,
  ): Promise<PrivateLog> {
    const addressPoint = await recipient.toAddressPoint();

    const ephPk = await derivePublicKeyFromSecretKey(ephSk);
    const incomingHeaderCiphertext = await encrypt(this.contractAddress.toBuffer(), ephSk, addressPoint);

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
    const incomingBodyCiphertext = await encrypt(paddedIncomingBodyPlaintextWithLength, ephSk, addressPoint);

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
   * @param ciphertextLength - Optionally supply the ciphertext length (see trimCiphertext())
   * @returns The decrypted log payload
   */
  public static async decryptAsIncoming(
    payload: Fr[],
    addressSecret: GrumpkinScalar,
    ciphertextLength?: number,
  ): Promise<EncryptedLogPayload | undefined> {
    try {
      const tag = payload[0];
      const reader = BufferReader.asReader(fieldsToEncryptedBytes(payload.slice(1)));

      const overhead = await Overhead.fromBuffer(reader);
      const { contractAddress } = await this.#decryptOverhead(overhead, { addressSecret });

      let ciphertext = reader.readToEnd();
      if (ciphertextLength && ciphertext.length !== ciphertextLength) {
        ciphertext = trimCiphertext(ciphertext, ciphertextLength);
      }
      const incomingBodyPlaintext = await this.#decryptIncomingBody(ciphertext, addressSecret, overhead.ephPk);

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

  static async #decryptOverhead(overhead: Overhead, { addressSecret }: { addressSecret: GrumpkinScalar }) {
    let contractAddress = AztecAddress.ZERO;

    if (addressSecret) {
      const incomingHeader = await decrypt(overhead.incomingHeader, addressSecret, overhead.ephPk);
      contractAddress = AztecAddress.fromBuffer(incomingHeader);
    }

    return {
      contractAddress,
    };
  }

  static async #decryptIncomingBody(ciphertext: Buffer, secret: GrumpkinScalar, publicKey: PublicKey) {
    const decrypted = await decrypt(ciphertext, secret, publicKey);
    const length = decrypted.readUint16BE(0);
    return decrypted.subarray(2, 2 + length);
  }
}
