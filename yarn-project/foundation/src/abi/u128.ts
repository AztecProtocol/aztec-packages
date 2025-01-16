import { Fr } from '../fields/fields.js';

// A typescript version of noir::std::U128
export class U128 {
  private readonly value: bigint;

  constructor(value: bigint | number) {
    if (typeof value === 'number') {
      value = BigInt(value);
    }

    // Check value is within 128 bits
    if (value < 0n || value >= 2n ** 128n) {
      throw new Error(`Value ${value} is not within 128 bits and hence cannot be converted to U128.`);
    }

    this.value = value;
  }

  static fromU64sLE(lo: bigint, hi: bigint): U128 {
    // Validate limbs are within valid ranges
    if (lo < 0n || lo >= 2n ** 64n) {
      throw new Error(`Lower limb ${lo} is not within valid range (0 to 2^64-1)`);
    }
    if (hi < 0n || hi >= 2n ** 64n) {
      throw new Error(`Higher limb ${hi} is not within valid range (0 to 2^64-1)`);
    }

    // Combine limbs into full value and create new instance
    const value = (hi << 64n) | lo;
    return new U128(value);
  }

  get lo(): bigint {
    return this.value & 0xffffffffffffffffn;
  }

  get hi(): bigint {
    return this.value >> 64n;
  }

  toInteger(): bigint {
    return this.value;
  }

  toFields(): Fr[] {
    return [new Fr(this.lo), new Fr(this.hi)];
  }
}
