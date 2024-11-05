import { AztecAddress } from '@aztec/foundation/aztec-address';
import { poseidon2Hash } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';

export class TaggingSecret {
  constructor(public secret: Fr, public recipient: AztecAddress) {}

  toFields(): Fr[] {
    return [this.secret, this.recipient];
  }
}

export class IndexedTaggingSecret extends TaggingSecret {
  constructor(secret: Fr, recipient: AztecAddress, public index: number) {
    super(secret, recipient);
  }

  override toFields(): Fr[] {
    return [this.secret, this.recipient, new Fr(this.index)];
  }

  static fromFields(serialized: Fr[]) {
    return new this(serialized[0], AztecAddress.fromField(serialized[1]), serialized[2].toNumber());
  }

  static fromTaggingSecret(directionalSecret: TaggingSecret, index: number) {
    return new this(directionalSecret.secret, directionalSecret.recipient, index);
  }

  computeTag() {
    return poseidon2Hash([this.secret, this.recipient, this.index]);
  }
}
