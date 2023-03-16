import { Pedersen } from './pedersen.js';
import { deserializeArrayFromVector, serializeBufferArrayToVector } from './serialise.js';

export class SiblingPath {
  public static ZERO(size: number, zeroElement: Buffer, pedersen: Pedersen) {
    const bufs: Buffer[] = [];
    let current = zeroElement;
    for (let i = 0; i < size; ++i) {
      bufs.push(current);
      current = pedersen.compress(current, current);
    }
    return new SiblingPath(bufs);
  }

  constructor(public data: Buffer[] = []) {}

  public toBuffer() {
    return serializeBufferArrayToVector(this.data);
  }

  static fromBuffer(buf: Buffer, offset = 0) {
    const { elem } = SiblingPath.deserialize(buf, offset);
    return elem;
  }

  static deserialize(buf: Buffer, offset = 0) {
    const deserializePath = (buf: Buffer, offset: number) => ({
      elem: buf.slice(offset, offset + 32),
      adv: 32,
    });
    const { elem, adv } = deserializeArrayFromVector(deserializePath, buf, offset);
    return { elem: new SiblingPath(elem), adv };
  }

  // For json serialization
  public toString() {
    return this.toBuffer().toString('hex');
  }

  // For json deserialization
  public static fromString(repr: string) {
    return SiblingPath.fromBuffer(Buffer.from(repr, 'hex'));
  }
}
