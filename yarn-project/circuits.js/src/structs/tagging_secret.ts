import { type AztecAddress } from '@aztec/foundation/aztec-address';
import { poseidon2Hash } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';

export class IndexedTaggingSecret {
  constructor(public secret: Fr, public index: number) {}

  toFields(): Fr[] {
    return [this.secret, new Fr(this.index)];
  }

  static fromFields(serialized: Fr[]) {
    return new this(serialized[0], serialized[1].toNumber());
  }

  computeTag(recipient: AztecAddress) {
    return poseidon2Hash([this.secret, recipient, this.index]);
  }

  computeSiloedTag(recipient: AztecAddress, contractAddress: AztecAddress) {
    const tag = this.computeTag(recipient);
    return poseidon2Hash([contractAddress, tag]);
  }
}
