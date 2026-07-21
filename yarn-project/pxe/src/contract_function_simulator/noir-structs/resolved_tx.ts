import type { Fr } from '@aztec/foundation/curves/bn254';
import type { TxHash } from '@aztec/stdlib/tx';

/**
 * The resolved on-chain context of a transaction.
 *
 * Carries the note hashes and first nullifier needed to discover notes that originated from the transaction, plus the
 * number and hash of the block in which it was mined.
 *
 * A TS version of the `ResolvedTx` struct in `oracle/tx_resolution.nr`; its wire layout lives in the `RESOLVED_TX`
 * type mapping.
 */
export type ResolvedTx = {
  txHash: TxHash;
  uniqueNoteHashesInTx: Fr[];
  firstNullifierInTx: Fr;
  blockNumber: number;
  blockHash: Fr;
};
