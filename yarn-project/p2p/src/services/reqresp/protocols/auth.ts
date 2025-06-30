import { Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { StatusMessage } from './status.js';

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
}

export class AuthResponse {
  constructor(
    readonly status: StatusMessage,
    readonly signature: Fr,
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
      Fr.fromBuffer(reader), // response
    );
  }

  /**
   * Serializes the AuthRequest object into a Buffer.
   * @returns Buffer representation of the StatusMessage object.
   */
  toBuffer() {
    return serializeToBuffer([this.status, this.signature]);
  }
}
