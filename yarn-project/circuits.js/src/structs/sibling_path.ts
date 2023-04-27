import { Fr } from '@aztec/foundation/fields';
import { assertLength } from '../utils/jsUtils.js';
import { serializeToBuffer } from '../utils/serialize.js';

export class SiblingPath<N extends number> {
  constructor(pathSize: N, public siblingPath: Fr[]) {
    assertLength(this, 'siblingPath', pathSize);
  }

  toBuffer() {
    return serializeToBuffer(this.siblingPath);
  }

  public static empty<N extends number>(pathSize: N) {
    const arr = Array(pathSize)
      .fill(0)
      .map(() => Fr.ZERO);
    return new SiblingPath<N>(pathSize, arr);
  }
}
