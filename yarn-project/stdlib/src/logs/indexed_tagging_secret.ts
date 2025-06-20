import { poseidon2Hash } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';

import type { AztecAddress } from '../aztec-address/index.js';

export class IndexedTaggingSecret {
  constructor(
    public appTaggingSecret: Fr,
    public index: number,
  ) {
    if (index < 0) {
      throw new Error('IndexedTaggingSecret index out of bounds');
    }
  }

  toFields(): Fr[] {
    return [this.appTaggingSecret, new Fr(this.index)];
  }

  static fromFields(serialized: Fr[]) {
    return new this(serialized[0], serialized[1].toNumber());
  }

  /**
   * Computes the tag based on the app tagging secret, recipient and index.
   * @dev By including the recipient we achieve "directionality" of the tag (when sending a note in the other
   * direction, the tag will be different).
   * @param recipient The recipient of the note
   * @returns The tag.
   */
  computeTag(recipient: AztecAddress) {
    return poseidon2Hash([this.appTaggingSecret, recipient, this.index]);
  }

  /**
   * Computes the siloed tag.
   * @dev We do this second layer of siloing (one was already done as the tagging secret is app-siloed) because kernels
   * do that to protect against contract impersonation attacks. This extra layer of siloing in kernels ensures that
   * a malicious contract cannot emit a note with a tag corresponding to another contract.
   * @param recipient The recipient of the note
   * @param app The app address
   * @returns The siloed tag.
   */
  async computeSiloedTag(recipient: AztecAddress, app: AztecAddress) {
    const tag = await this.computeTag(recipient);
    return poseidon2Hash([app, tag]);
  }
}
