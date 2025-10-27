import { BarretenbergSync } from '@aztec/bb.js';

/**
 * Secp256k1 elliptic curve operations.
 */
export class Secp256k1 {
  // prettier-ignore
  static generator = Buffer.from([
    0x79, 0xbe, 0x66, 0x7e, 0xf9, 0xdc, 0xbb, 0xac, 0x55, 0xa0, 0x62, 0x95, 0xce, 0x87, 0x0b, 0x07,
    0x02, 0x9b, 0xfc, 0xdb, 0x2d, 0xce, 0x28, 0xd9, 0x59, 0xf2, 0x81, 0x5b, 0x16, 0xf8, 0x17, 0x98,
    0x48, 0x3a, 0xda, 0x77, 0x26, 0xa3, 0xc4, 0x65, 0x5d, 0xa4, 0xfb, 0xfc, 0x0e, 0x11, 0x08, 0xa8,
    0xfd, 0x17, 0xb4, 0x48, 0xa6, 0x85, 0x54, 0x19, 0x9c, 0x47, 0xd0, 0x8f, 0xfb, 0x10, 0xd4, 0xb8,
  ]);

  /**
   * Point generator
   * @returns The generator for the curve.
   */
  public generator(): Buffer {
    return Secp256k1.generator;
  }

  /**
   * Multiplies a point by a scalar (adds the point `scalar` amount of time).
   * @param point - Point to multiply.
   * @param scalar - Scalar to multiply by.
   * @returns Result of the multiplication.
   */
  public async mul(point: Uint8Array, scalar: Uint8Array) {
    await BarretenbergSync.initSingleton();
    const api = BarretenbergSync.getSingleton();
    const response = api.secp256k1Mul({
      point: { x: point.subarray(0, 32), y: point.subarray(32, 64) },
      scalar,
    });
    return Buffer.concat([Buffer.from(response.point.x), Buffer.from(response.point.y)]);
  }

  /**
   * Gets a random field element.
   * @returns Random field element.
   */
  public async getRandomFr() {
    await BarretenbergSync.initSingleton();
    const api = BarretenbergSync.getSingleton();
    const response = api.secp256k1GetRandomFr({ dummy: 0 });
    return Buffer.from(response.value);
  }

  /**
   * Converts a 512 bits long buffer to a field.
   * @param uint512Buf - The buffer to convert.
   * @returns Buffer representation of the field element.
   */
  public async reduce512BufferToFr(uint512Buf: Buffer) {
    await BarretenbergSync.initSingleton();
    const api = BarretenbergSync.getSingleton();
    const response = api.secp256k1Reduce512({ input: uint512Buf });
    return Buffer.from(response.value);
  }
}
