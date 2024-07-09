import { AztecAddress, Fr, GeneratorIndex, EmbeddedCurveScalar, Point, type PublicKey } from '@aztec/circuits.js';
import { Aes128 } from '@aztec/circuits.js/barretenberg';
import { poseidon2Hash } from '@aztec/foundation/crypto';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

export class EncryptedLogOutgoingBody {
  constructor(public ephSk: EmbeddedCurveScalar, public recipient: AztecAddress, public recipientIvpkApp: PublicKey) {}

  /**
   * Serializes the log body
   *
   * @returns The serialized log body
   */
  public toBuffer(): Buffer {
    // The serialization of Fq is [high, low] check `grumpkin_private_key.nr`
    const ephSkBytes = serializeToBuffer([this.ephSk.high, this.ephSk.low]);
    return serializeToBuffer(ephSkBytes, this.recipient, this.recipientIvpkApp);
  }

  /**
   * Deserialized the log body from a buffer
   *
   * @param buf - The buffer to deserialize
   * @returns The deserialized log body
   */
  public static fromBuffer(buf: Buffer): EncryptedLogOutgoingBody {
    const reader = BufferReader.asReader(buf);
    const high = reader.readObject(Fr);
    const low = reader.readObject(Fr);
    const ephSk = EmbeddedCurveScalar.fromHighLow(high, low);
    const recipient = reader.readObject(AztecAddress);
    const recipientIvpkApp = reader.readObject(Point); // PublicKey = Point

    return new EncryptedLogOutgoingBody(ephSk, recipient, recipientIvpkApp);
  }

  /**
   * Encrypts a log body
   *
   * @param ovskApp - The app siloed outgoing viewing secret key
   * @param ephPk - The ephemeral public key
   *
   * @returns The ciphertext of the encrypted log body
   */
  public computeCiphertext(ovskApp: EmbeddedCurveScalar, ephPk: PublicKey) {
    // We could use `ephSk` and compute `ephPk` from it.
    // We mainly provide it to keep the same api and potentially slight optimization as we can reuse it.

    const aesSecret = EncryptedLogOutgoingBody.derivePoseidonAESSecret(ovskApp, ephPk);

    const key = aesSecret.subarray(0, 16);
    const iv = aesSecret.subarray(16, 32);

    const aes128 = new Aes128();
    const buffer = this.toBuffer();

    return aes128.encryptBufferCBC(buffer, iv, key);
  }

  /**
   * Decrypts a log body
   *
   * @param ciphertext - The ciphertext buffer
   * @param ovskApp - The app siloed outgoing viewing secret key
   * @param ephPk - The ephemeral public key
   *
   * @returns The decrypted log body
   */
  public static fromCiphertext(
    ciphertext: Buffer | bigint[],
    ovskApp: EmbeddedCurveScalar,
    ephPk: PublicKey,
  ): EncryptedLogOutgoingBody {
    const input = Buffer.isBuffer(ciphertext) ? ciphertext : Buffer.from(ciphertext.map((x: bigint) => Number(x)));

    const aesSecret = EncryptedLogOutgoingBody.derivePoseidonAESSecret(ovskApp, ephPk);
    const key = aesSecret.subarray(0, 16);
    const iv = aesSecret.subarray(16, 32);

    const aes128 = new Aes128();
    const buffer = aes128.decryptBufferCBC(input, iv, key);

    return EncryptedLogOutgoingBody.fromBuffer(buffer);
  }

  /**
   * Derives an AES symmetric key from the app siloed outgoing viewing secret key
   * and the ephemeral public key using poseidon.
   *
   * @param ovskApp - The app siloed outgoing viewing secret key
   * @param ephPk - The ephemeral public key
   * @returns The derived AES symmetric key
   */
  private static derivePoseidonAESSecret(ovskApp: EmbeddedCurveScalar, ephPk: PublicKey) {
    // For performance reasons, we do NOT use the usual `deriveAESSecret` function here and instead we compute it using
    // poseidon. Note that we can afford to use poseidon here instead of deriving shared secret using Diffie-Hellman
    // because for outgoing we are encrypting for ourselves and hence we don't need to perform a key exchange.
    return poseidon2Hash([ovskApp.high, ovskApp.low, ephPk.x, ephPk.y, GeneratorIndex.SYMMETRIC_KEY]).toBuffer();
  }
}
