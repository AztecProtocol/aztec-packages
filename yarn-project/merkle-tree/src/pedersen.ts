/* eslint-disable */
import { Hasher } from './hasher.js';

export class Pedersen implements Hasher {
  public compress(lhs: Uint8Array, rhs: Uint8Array): Buffer {
    return Buffer.alloc(32);
  }
  public hashToField(data: Uint8Array): Buffer {
    return Buffer.alloc(32);
  }
  public hashToTree(leaves: Buffer[]): Promise<Buffer[]> {
    return Promise.resolve([Buffer.alloc(32)]);
  }
}
