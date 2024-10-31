import { type AztecAddress } from '@aztec/foundation/aztec-address';
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
}
