import {
  AztecAddress,
  Fr,
  type GrumpkinScalar,
  NotOnCurveError,
  PRIVATE_LOG_SIZE_IN_FIELDS,
  Point,
  PrivateLog,
  derivePublicKeyFromSecretKey,
} from '@aztec/circuits.js';
import { randomBytes } from '@aztec/foundation/crypto';
import { BufferReader, type Tuple, numToUInt16BE, serializeToBuffer } from '@aztec/foundation/serialize';

import {
  aes128Decrypt,
  aes128Encrypt,
  deriveAesSymmetricKeyAndIvFromEcdhSharedSecretUsingSha256,
} from './encryption_util.js';
import { deriveEcdhSharedSecret, deriveEcdhSharedSecretUsingAztecAddress } from './shared_secret_derivation.js';

// Below constants should match the values defined in aztec-nr/aztec/src/encrypted_logs/log_assembly_strategies/default_aes128/note.nr.
// Note: we will soon be 'abstracting' log processing: apps will process their own logs, instead of the PXE processing all apps' logs. Therefore, this file will imminently change considerably.

const TAG_SIZE_IN_FIELDS = 1;
const EPK_SIZE_IN_FIELDS = 1;

const USABLE_PRIVATE_LOG_SIZE_IN_FIELDS = PRIVATE_LOG_SIZE_IN_FIELDS - TAG_SIZE_IN_FIELDS - EPK_SIZE_IN_FIELDS;
const USABLE_PRIVATE_LOG_SIZE_IN_BYTES = ((USABLE_PRIVATE_LOG_SIZE_IN_FIELDS * 31) / 16) * 16;

// The incoming header ciphertext is 48 bytes
// 32 bytes for the address, and 16 bytes padding to follow PKCS#7
const HEADER_CIPHERTEXT_SIZE_IN_BYTES = 48;
const USABLE_PLAINTEXT_SIZE_IN_BYTES = USABLE_PRIVATE_LOG_SIZE_IN_BYTES - HEADER_CIPHERTEXT_SIZE_IN_BYTES;

const CONTRACT_ADDRESS_SIZE_IN_BYTES = 32;

const SIZE_OF_ENCODING_OF_CIPHERTEXT_SIZE_IN_BYTES = 2;

function beBytes31ToFields(bytes: Buffer): Fr[] {
  const fields = [];
  const numFields = Math.ceil(bytes.length / 31);
  for (let i = 0; i < numFields; i++) {
    fields.push(new Fr(bytes.subarray(i * 31, (i + 1) * 31)));
  }
  return fields;
}

function fieldsToBEBytes31(fields: Fr[]) {
  return Buffer.concat(fields.map(f => f.toBuffer().subarray(1)));
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

  // NB: Only appears to be used in tests
  // See noir-projects/aztec-nr/aztec/src/encrypted_logs/log_assembly_strategies/default_aes128/note.nr
  public async generatePayload(
    ephSk: GrumpkinScalar,
    recipient: AztecAddress,
    rand: (len: number) => Buffer = randomBytes,
  ): Promise<PrivateLog> {
    const ephPk = await derivePublicKeyFromSecretKey(ephSk);
    const [ephPkX, ephPkSignBool] = ephPk.toXAndSign();
    const ephPkSignU8 = Buffer.from([Number(ephPkSignBool)]);

    const ciphertextSharedSecret = await deriveEcdhSharedSecretUsingAztecAddress(ephSk, recipient); // not to be confused with the tagging shared secret

    const [symKey, iv] = deriveAesSymmetricKeyAndIvFromEcdhSharedSecretUsingSha256(ciphertextSharedSecret);

    if (this.incomingBodyPlaintext.length > USABLE_PLAINTEXT_SIZE_IN_BYTES) {
      throw new Error(`Incoming body plaintext cannot be more than ${USABLE_PLAINTEXT_SIZE_IN_BYTES} bytes.`);
    }

    const finalPlaintext = this.incomingBodyPlaintext;

    const ciphertextBytes = await aes128Encrypt(finalPlaintext, iv, symKey);

    const headerPlaintext = serializeToBuffer(this.contractAddress.toBuffer(), numToUInt16BE(ciphertextBytes.length));

    // TODO: it is unsafe to re-use the same iv and symKey. We'll need to do something cleverer.
    const headerCiphertextBytes = await aes128Encrypt(headerPlaintext, iv, symKey);

    if (headerCiphertextBytes.length !== HEADER_CIPHERTEXT_SIZE_IN_BYTES) {
      throw new Error(`Invalid header ciphertext size: ${headerCiphertextBytes.length}`);
    }

    const properLogBytesLength = 1 /* ephPkSignU8 */ + HEADER_CIPHERTEXT_SIZE_IN_BYTES + ciphertextBytes.length;

    const logBytesPaddingToMult31 = rand(31 * Math.ceil(properLogBytesLength / 31) - properLogBytesLength);

    const logBytes = serializeToBuffer(ephPkSignU8, headerCiphertextBytes, ciphertextBytes, logBytesPaddingToMult31);

    if (logBytes.length % 31 !== 0) {
      throw new Error(`logBytes.length should be divisible by 31, got: ${logBytes.length}`);
    }

    const fieldsPadding = Array.from({ length: USABLE_PRIVATE_LOG_SIZE_IN_FIELDS - logBytes.length / 31 }, () =>
      Fr.fromBuffer(rand(32)),
    ); // we use the randomBytes function instead of `Fr.random()`, so that we can use deterministic randomness in tests, through the rand() function.

    const logFields = [this.tag, ephPkX, ...beBytes31ToFields(logBytes), ...fieldsPadding] as Tuple<
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
  ): Promise<EncryptedLogPayload | undefined> {
    try {
      const logFields = payload;

      const tag = logFields[0];
      const ephPkX = logFields[1];

      const reader = BufferReader.asReader(fieldsToBEBytes31(logFields.slice(TAG_SIZE_IN_FIELDS + EPK_SIZE_IN_FIELDS)));

      const ephPkSigBuf = reader.readBytes(1);
      const ephPkSignBool = !!ephPkSigBuf[0];
      const ephPk = await Point.fromXAndSign(ephPkX, ephPkSignBool);

      const headerCiphertextBytes = reader.readBytes(HEADER_CIPHERTEXT_SIZE_IN_BYTES);

      let contractAddress = AztecAddress.ZERO;
      if (!addressSecret) {
        throw new Error('Cannot decrypt without an address secret.');
      }

      const ciphertextSharedSecret = await deriveEcdhSharedSecret(addressSecret, ephPk);

      const [symKey, iv] = deriveAesSymmetricKeyAndIvFromEcdhSharedSecretUsingSha256(ciphertextSharedSecret);

      const headerPlaintextBytes = await aes128Decrypt(headerCiphertextBytes, iv, symKey);

      const headerReader = BufferReader.asReader(headerPlaintextBytes);

      const contractAddressBuf = headerReader.readBytes(CONTRACT_ADDRESS_SIZE_IN_BYTES);
      contractAddress = AztecAddress.fromBuffer(contractAddressBuf);

      const ciphertextBytesLengthBuf = headerReader.readBytes(SIZE_OF_ENCODING_OF_CIPHERTEXT_SIZE_IN_BYTES);
      const ciphertextBytesLength = (ciphertextBytesLengthBuf[0] << 8) + ciphertextBytesLengthBuf[1];

      const ciphertextBytes = reader.readBytes(ciphertextBytesLength);

      const plaintextBytes = await aes128Decrypt(ciphertextBytes, iv, symKey);

      return new EncryptedLogPayload(tag, contractAddress, plaintextBytes);
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
