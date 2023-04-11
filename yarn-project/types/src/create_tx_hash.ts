import { Fr, keccak } from '@aztec/foundation';
import { TxHash } from './tx_hash.js';

export interface TxData {
  newCommitments: Fr[];
  newNullifiers: Fr[];
  newContracts: Fr[];
}

/**
 * Utility function to generate tx hash.
 * @param tx - The transaction from which to generate the hash.
 * @returns A hash of the tx data that identifies the tx.
 */
export function createTxHash(tx: TxData) {
  const data = Buffer.concat(
    [
      tx.newCommitments.map(x => x.toBuffer()),
      tx.newNullifiers.map(x => x.toBuffer()),
      tx.newContracts.map(x => x.toBuffer()),
    ].flat(),
  );
  return new TxHash(keccak(data));
}
