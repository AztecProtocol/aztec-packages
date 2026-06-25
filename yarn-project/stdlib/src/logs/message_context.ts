import type { Fr } from '@aztec/foundation/curves/bn254';

import type { TxHash } from '../tx/tx_hash.js';

/**
 * Additional information needed to process a message.
 *
 * All messages exist in the context of a transaction, and information about that transaction is typically required
 * in order to perform validation, store results, etc. For example, messages containing notes require knowledge of note
 * hashes and the first nullifier in order to find the note's nonce.
 *
 * A TS version of `message_context.nr`.
 */
export type MessageContext = {
  txHash: TxHash;
  uniqueNoteHashesInTx: Fr[];
  firstNullifierInTx: Fr;
};
