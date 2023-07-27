import { IWasmModule } from '@aztec/foundation/wasm';

import { CircuitsWasm, Fr, Point, PrivateKey } from '../../../index.js';
import { Curve } from '../index.js';

/**
 * Grumpkin elliptic curve operations.
 */
export class Grumpkin implements Curve {
  /**
   * Creates a new Grumpkin instance.
   * @returns New Grumpkin instance.
   */
  public static async new() {
    return new this(await CircuitsWasm.get());
  }

  constructor(private wasm: IWasmModule) {}

  // prettier-ignore
  static generator = Point.fromBuffer(Buffer.from([
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02, 0xcf, 0x13, 0x5e, 0x75, 0x06, 0xa4, 0x5d, 0x63,
    0x2d, 0x27, 0x0d, 0x45, 0xf1, 0x18, 0x12, 0x94, 0x83, 0x3f, 0xc4, 0x8d, 0x82, 0x3f, 0x27, 0x2c,
  ]));

  /**
   * Point generator
   * @returns The generator for the curve.
   */
  public generator(): Point {
    return Grumpkin.generator;
  }

  /**
   * Multiplies a point by a private key (adds the point `privateKey` amount of time).
   * @param point - Point to multiply.
   * @param privateKey - Private key to multiply by.
   * @returns Result of the multiplication.
   */
  public mul(point: Point, privateKey: PrivateKey): Point {
    this.wasm.writeMemory(0, point.toBuffer());
    this.wasm.writeMemory(64, privateKey.value);
    this.wasm.call('ecc_grumpkin__mul', 0, 64, 96);
    return Point.fromBuffer(Buffer.from(this.wasm.getMemorySlice(96, 160)));
  }

  /**
   * Multiplies a set of points by a private key.
   * @param points - Points to multiply.
   * @param privateKey - Private key to multiply by.
   * @returns Points multiplied by the private key.
   */
  public batchMul(points: Point[], privateKey: PrivateKey) {
    const concatenatedPoints: Buffer = Buffer.concat(points.map(point => point.toBuffer()));
    const pointsByteLength = points.length * Point.SIZE_IN_BYTES;

    const mem = this.wasm.call('bbmalloc', pointsByteLength * 2);

    this.wasm.writeMemory(mem, concatenatedPoints);
    this.wasm.writeMemory(0, privateKey.value);
    this.wasm.call('ecc_grumpkin__batch_mul', mem, 0, points.length, mem + pointsByteLength);

    const result: Buffer = Buffer.from(
      this.wasm.getMemorySlice(mem + pointsByteLength, mem + pointsByteLength + pointsByteLength),
    );
    this.wasm.call('bbfree', mem);

    const parsedResult: Point[] = [];
    for (let i = 0; i < pointsByteLength; i += 64) {
      parsedResult.push(Point.fromBuffer(result.slice(i, i + 64)));
    }
    return parsedResult;
  }

  /**
   * Gets a random field element.
   * @returns Random field element.
   */
  public getRandomFr(): Fr {
    this.wasm.call('ecc_grumpkin__get_random_scalar_mod_circuit_modulus', 0);
    return Fr.fromBuffer(Buffer.from(this.wasm.getMemorySlice(0, 32)));
  }

  /**
   * Converts a 512 bits long buffer to a field.
   * @param uint512Buf - The buffer to convert.
   * @returns Buffer representation of the field element.
   */
  public reduce512BufferToFr(uint512Buf: Buffer): Fr {
    this.wasm.writeMemory(0, uint512Buf);
    this.wasm.call('ecc_grumpkin__reduce512_buffer_mod_circuit_modulus', 0, 64);
    return Fr.fromBuffer(Buffer.from(this.wasm.getMemorySlice(64, 96)));
  }
}
