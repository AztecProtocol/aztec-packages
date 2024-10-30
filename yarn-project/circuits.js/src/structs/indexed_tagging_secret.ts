import { Fr } from '@aztec/foundation/fields';

export class IndexedTaggingSecret {
  constructor(public secret: Fr, public index: number) {}

  toFields(): Fr[] {
    return [this.secret, new Fr(this.index)];
  }
}
