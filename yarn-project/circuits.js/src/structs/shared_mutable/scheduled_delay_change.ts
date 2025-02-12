import { Fr } from '@aztec/foundation/fields';
import { BufferReader } from '@aztec/foundation/serialize';

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

  static computeSlot(sharedMutableSlot: Fr) {
    return sharedMutableSlot;
  }

  static async readFromTree(sharedMutableSlot: Fr, reader: (storageSlot: Fr) => Promise<Fr>) {
    const delaySlot = this.computeSlot(sharedMutableSlot);
    return ScheduledDelayChange.fromField(await reader(delaySlot));
  }

  async writeToTree(sharedMutableSlot: Fr, writer: (storageSlot: Fr, value: Fr) => Promise<void>) {
    const delaySlot = ScheduledDelayChange.computeSlot(sharedMutableSlot);
    await writer(delaySlot, this.toField());
  }
}
