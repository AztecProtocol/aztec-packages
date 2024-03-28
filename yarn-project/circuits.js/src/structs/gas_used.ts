import { BufferReader } from '@aztec/foundation/serialize';

import { inspect } from 'util';

export class GasUsed {
  public static readonly PACKED_SIZE_IN_BYTES = 8n;
  public static readonly MAX_VALUE = 2n ** (GasUsed.PACKED_SIZE_IN_BYTES * 8n) - 1n;
  private static readonly PREIMAGE_SIZE_IN_BYTES = 32n;

  public readonly value: bigint;

  constructor(gas: bigint) {
    if (gas < 0) {
      throw new Error('Gas used cannot be negative');
    } else if (gas > GasUsed.MAX_VALUE) {
      throw new Error(`Gas used is too large: [${gas}] does not fit in a ${GasUsed.PACKED_SIZE_IN_BYTES} byte field`);
    }

    this.value = BigInt(gas);
  }

  public add(other: bigint | number | GasUsed): GasUsed {
    if (typeof other === 'bigint') {
      return new GasUsed(this.value + other);
    } else if (typeof other === 'number') {
      return new GasUsed(this.value + BigInt(other));
    } else {
      return new GasUsed(this.value + other.value);
    }
  }

  public toHashPreimage(): Buffer {
    const padding = Buffer.alloc(Number(GasUsed.PREIMAGE_SIZE_IN_BYTES - GasUsed.PACKED_SIZE_IN_BYTES));
    return Buffer.concat([padding, this.toBuffer()]);
  }

  public toBuffer(): Buffer {
    const b = Buffer.alloc(Number(GasUsed.PACKED_SIZE_IN_BYTES));
    b.writeBigUInt64BE(this.value);
    return b;
  }

  public equals(other: GasUsed): boolean {
    return this.value === other.value;
  }

  public toString(): string {
    return this.value.toString();
  }

  static fromString(str: string): GasUsed {
    return new GasUsed(BigInt(str));
  }

  static empty(): GasUsed {
    return new GasUsed(0n);
  }

  static fromBuffer(buffer: Buffer | BufferReader): GasUsed {
    const reader = BufferReader.asReader(buffer);
    const gas = reader.readBytes(Number(GasUsed.PACKED_SIZE_IN_BYTES)).readBigUInt64BE();
    return new GasUsed(gas);
  }

  /**
   *
   * @returns A barely random instance of GasUsed. Not suitable for cryptographic use.
   */
  static random(): GasUsed {
    let g = GasUsed.MAX_VALUE + 1n;
    while (g > GasUsed.MAX_VALUE) {
      g = BigInt(Math.floor(Math.random() * Number(GasUsed.MAX_VALUE)));
    }
    return new GasUsed(g);
  }

  [inspect.custom]() {
    return `GasUsed<${this.value}>`;
  }
}
