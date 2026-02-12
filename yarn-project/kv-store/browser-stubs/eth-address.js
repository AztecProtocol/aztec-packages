// Browser stub for @aztec/foundation/eth-address
// Only used during vitest browser tests to avoid loading Barretenberg WASM.
import { z } from 'zod';

export class EthAddress {
  constructor(buffer) {
    // Accept either a Buffer, Uint8Array, or string
    if (typeof buffer === 'string') {
      // Remove 0x prefix if present
      const hex = buffer.startsWith('0x') ? buffer.slice(2) : buffer;
      // Pad to 40 characters (20 bytes)
      this.buffer = new Uint8Array(20);
      for (let i = 0; i < Math.min(hex.length / 2, 20); i++) {
        this.buffer[i] = parseInt(hex.substr(i * 2, 2), 16);
      }
    } else if (buffer instanceof Uint8Array || buffer instanceof Buffer) {
      this.buffer = new Uint8Array(buffer.slice(0, 20));
    } else {
      this.buffer = new Uint8Array(20);
    }
  }

  static random() {
    // Generate a random 20-byte address
    const buffer = new Uint8Array(20);
    for (let i = 0; i < 20; i++) {
      buffer[i] = Math.floor(Math.random() * 256);
    }
    return new EthAddress(buffer);
  }

  static fromString(str) {
    return new EthAddress(str);
  }

  static ZERO = new EthAddress(new Uint8Array(20));

  toString() {
    return (
      '0x' +
      Array.from(this.buffer)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
    );
  }

  toBuffer() {
    return this.buffer;
  }

  toJSON() {
    return this.toString();
  }

  equals(other) {
    if (!other || !other.buffer) return false;
    if (this.buffer.length !== other.buffer.length) return false;
    for (let i = 0; i < this.buffer.length; i++) {
      if (this.buffer[i] !== other.buffer[i]) return false;
    }
    return true;
  }

  static get schema() {
    return z
      .string()
      .regex(/^(0x)?[0-9a-fA-F]{40}$/, 'Invalid Ethereum address format')
      .transform(str => EthAddress.fromString(str));
  }
}

export default { EthAddress };
