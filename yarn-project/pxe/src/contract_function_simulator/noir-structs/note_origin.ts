import type { Fr } from '@aztec/foundation/curves/bn254';

import type { BlockReference } from '../../storage/fact_store/index.js';

/** TypeScript counterpart of `NoteOrigin` in Aztec.nr. */
export type NoteOrigin = {
  /** Hash of the tx that created the note. */
  txHash: Fr;
  /** The block that tx was included in. */
  block: BlockReference;
};
