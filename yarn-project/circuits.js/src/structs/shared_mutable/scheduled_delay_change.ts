import { poseidon2HashWithSeparator } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader } from '@aztec/foundation/serialize';

import { SHARED_MUTABLE_DELAY_CHANGE_SEPARATOR } from '../../constants.gen.js';
import { type UInt32 } from '../shared.js';

export class ScheduledDelayChange {
  constructor(public previous: UInt32 | undefined, public blockOfChange: UInt32, public post: UInt32 | undefined) {}

  static fromField(field: Fr) {
    const asBigint = field.toBigInt();
    const post = asBigint & 0xffffffffn;
    const pre = (asBigint >> 32n) & 0xffffffffn;
    const blockOfChange = (asBigint >> 64n) & 0xffffffffn;
    const isPostSome = (asBigint >> 96n) & 1n;
    const isPreSome = (asBigint >> 97n) & 1n;
    return new this(isPreSome ? Number(pre) : undefined, Number(blockOfChange), isPostSome ? Number(post) : undefined);
  }

  toField(): Fr {
    // high bits [ pre_is_some: u1 |  post_is_some: u1 | block_of_change: u32 | pre_inner: u32 | post_inner: u32 ] low bits
    let result = BigInt(this.post || 0);
    result |= BigInt(this.previous || 0) << 32n;
    result |= BigInt(this.blockOfChange) << 64n;
    result |= this.post === undefined ? 0n : 1n << 96n;
    result |= this.previous === undefined ? 0n : 1n << 97n;
    return new Fr(result);
  }

  toBuffer(): Buffer {
    return this.toField().toBuffer();
  }

  static fromBuffer(buffer: Buffer | BufferReader): ScheduledDelayChange {
    const reader = BufferReader.asReader(buffer);
    return ScheduledDelayChange.fromField(reader.readObject(Fr));
  }

  static empty() {
    return new this(undefined, 0, undefined);
  }

  isEmpty(): boolean {
    return this.toField().isEmpty();
  }

  static async computeSlot(sharedMutableSlot: Fr) {
    return await poseidon2HashWithSeparator([sharedMutableSlot], SHARED_MUTABLE_DELAY_CHANGE_SEPARATOR);
  }

  static async readFromTree(sharedMutableSlot: Fr, reader: (storageSlot: Fr) => Promise<Fr>) {
    const delaySlot = await this.computeSlot(sharedMutableSlot);
    return ScheduledDelayChange.fromField(await reader(delaySlot));
  }
}
