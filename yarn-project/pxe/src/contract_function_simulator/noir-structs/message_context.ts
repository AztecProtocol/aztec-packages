import type { Fr } from '@aztec/foundation/curves/bn254';
import type { TxHash } from '@aztec/stdlib/tx';

/**
 * Additional information needed to process a message.
 *
 * All messages exist in the context of a transaction, and information about that transaction is typically required in
 * order to perform validation, store results, etc. For example, messages containing notes require knowledge of the note
 * hashes and the first nullifier in order to find the note's nonce.
 *
 * Note: this type is on its way to deprecation but it needs to be kept to honor backwards compatibility at least for
 * the lifespan of the v5 of the protocol.
 */
export type MessageContext = {
  txHash: TxHash;
  uniqueNoteHashesInTx: Fr[];
  firstNullifierInTx: Fr;
};
