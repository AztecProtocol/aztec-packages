import { Buffer32 } from '@aztec/foundation/buffer';
import { keccak256 } from '@aztec/foundation/crypto';
import { Signature } from '@aztec/foundation/eth-signature';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { StatusMessage } from './status.js';

export const VALIDATOR_AUTH_DOMAIN_SEPARATOR = 'Aztec Validator Challenge:';
export const VALIDATOR_AUTH_FULL_CHALLENGE_ENCODED_LENGTH =
  VALIDATOR_AUTH_DOMAIN_SEPARATOR.length + Fr.random().toString().length;

/*
 * P2P Auth Message
 * Superset of the StatusMessage, used to establish a handshake between peers and authenticate them.
 */
export class AuthRequest {
  constructor(
    readonly status: StatusMessage,
    readonly challenge: Fr,
  ) {}

  /**
   * Deserializes the AuthRequest object from a Buffer.
   * @param buffer - Buffer or BufferReader object to deserialize.
   * @returns An instance of StatusMessage.
   */
  static fromBuffer(buffer: Buffer | BufferReader): AuthRequest {
    const reader = BufferReader.asReader(buffer);
    return new AuthRequest(
      StatusMessage.fromBuffer(reader), // Deserialize StatusMessage
      Fr.fromBuffer(reader), // challenge
    );
  }

  /**
   * Serializes the AuthRequest object into a Buffer.
   * @returns Buffer representation of the StatusMessage object.
   */
  toBuffer() {
    return serializeToBuffer([this.status, this.challenge]);
  }

  getPayloadToSign(): Buffer32 {
    const fullChallenge = VALIDATOR_AUTH_DOMAIN_SEPARATOR + this.challenge.toString();
    return Buffer32.fromBuffer(keccak256(Buffer.from(fullChallenge, 'utf-8')));
  }

  static random(): AuthRequest {
    return new AuthRequest(StatusMessage.random(), Fr.random());
  }
}

export class AuthResponse {
  constructor(
    readonly status: StatusMessage,
    readonly signature: Signature,
  ) {}
  /**
   * Deserializes the AuthResponse object from a Buffer.
   * @param buffer - Buffer or BufferReader object to deserialize.
   * @returns An instance of StatusMessage.
   */
  static fromBuffer(buffer: Buffer | BufferReader): AuthResponse {
    const reader = BufferReader.asReader(buffer);
    return new AuthResponse(
      StatusMessage.fromBuffer(reader), // Deserialize StatusMessage
      Signature.fromBuffer(reader), // response
    );
  }

  /**
   * Serializes the AuthRequest object into a Buffer.
   * @returns Buffer representation of the StatusMessage object.
   */
  toBuffer() {
    return serializeToBuffer([this.status, this.signature]);
  }

  static random(): AuthResponse {
    return new AuthResponse(StatusMessage.random(), Signature.random());
  }
}
