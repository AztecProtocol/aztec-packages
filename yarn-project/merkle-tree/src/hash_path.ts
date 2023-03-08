import { Pedersen } from './pedersen.js';
import { deserializeArrayFromVector, serializeBufferArrayToVector } from './serialise.js';

export class HashPath {
  public static ZERO(size: number, zeroElement: Buffer, pedersen: Pedersen) {
    const bufs: Buffer[][] = [];
    let current = zeroElement;
    for (let i = 0; i < size; ++i) {
      bufs.push([current, current]);
      current = pedersen.compress(current, current);
    }
    return new HashPath(bufs);
  }

  constructor(public data: Buffer[][] = []) {}

  public toBuffer() {
    const elements = this.data.map(nodes => Buffer.concat([nodes[0], nodes[1]]));
    return serializeBufferArrayToVector(elements);
  }

  static fromBuffer(buf: Buffer, offset = 0) {
    const { elem } = HashPath.deserialize(buf, offset);
    return elem;
  }

  static deserialize(buf: Buffer, offset = 0) {
    const deserializePath = (buf: Buffer, offset: number) => ({
      elem: [buf.slice(offset, offset + 32), buf.slice(offset + 32, offset + 64)],
      adv: 64,
    });
    const { elem, adv } = deserializeArrayFromVector(deserializePath, buf, offset);
    return { elem: new HashPath(elem), adv };
  }

  // For json serialization
  public toString() {
    return this.toBuffer().toString('hex');
  }

  // For json deserialization
  public static fromString(repr: string) {
    return HashPath.fromBuffer(Buffer.from(repr, 'hex'));
  }
}
