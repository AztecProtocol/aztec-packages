import { randomBytes } from '../../random/index.js';
import {
  buffer32BytesToBigIntBE,
  uint8ArrayToBigIntBE,
  bigIntToBufferBE,
  bigIntToUint8ArrayBE,
} from './bigint-buffer.js';

export class Fr {
  static ZERO = new Fr(0n);
  static MODULUS = 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001n;
  static MAX_VALUE = this.MODULUS - 1n;
  static SIZE_IN_BYTES = 32;
  value: Uint8Array;

  constructor(value: Uint8Array | Buffer | bigint) {
    // We convert buffer value to bigint to be able to check it fits within modulus
    const valueBigInt =
      typeof value === 'bigint'
        ? value
        : value instanceof Buffer
          ? buffer32BytesToBigIntBE(value)
          : uint8ArrayToBigIntBE(value);

    if (valueBigInt > Fr.MAX_VALUE) {
      throw new Error(`Value 0x${valueBigInt.toString(16)} is greater or equal to field modulus.`);
    }

    this.value =
      typeof value === 'bigint' ? bigIntToUint8ArrayBE(value) : value instanceof Buffer ? new Uint8Array(value) : value;
  }

  static random() {
    const r = uint8ArrayToBigIntBE(randomBytes(64)) % Fr.MODULUS;
    return new this(r);
  }

  toBuffer() {
    return this.value;
  }

  toString() {
    return '0x' + this.toBuffer().reduce((accumulator, byte) => accumulator + byte.toString(16).padStart(2, '0'), '');
  }

  equals(rhs: Fr) {
    return this.value.every((v, i) => v === rhs.value[i]);
  }

  isZero() {
    return this.value.every(v => v === 0);
  }

  static fromBuffer(value: Uint8Array): Fr {
    return Fr.fromBufferReduce(value);
  }

  static fromBufferReduce(value: Uint8Array): Fr {
    const valueBigInt = uint8ArrayToBigIntBE(value);
    const reducedValue = valueBigInt % Fr.MODULUS;
    return new Fr(reducedValue);
  }
}
