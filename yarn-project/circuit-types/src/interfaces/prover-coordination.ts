import { type ApiSchemaFor } from '@aztec/circuits.js/schemas';

import { z } from 'zod';

import { Tx } from '../tx/tx.js';
import { TxHash } from '../tx/tx_hash.js';

/** Provides basic operations for ProverNodes to interact with other nodes in the network. */
export interface ProverCoordination {
  /**
   * Returns a transaction given its hash if available.
   * @param txHash - The hash of the transaction, used as an ID.
   * @returns The transaction, if found, 'undefined' otherwise.
   */
  getTxByHash(txHash: TxHash): Promise<Tx | undefined>;

  /**
   * Returns a set of transactions given their hashes if available.
   * @param txHashes - The hashes of the transactions, used as an ID.
   * @returns The transactions, if found, 'undefined' otherwise.
   */
  getTxsByHash(txHashes: TxHash[]): Promise<Tx[]>;
}

export const ProverCoordinationApiSchema: ApiSchemaFor<ProverCoordination> = {
  getTxByHash: z.function().args(TxHash.schema).returns(Tx.schema.optional()),
  getTxsByHash: z.function().args(z.array(TxHash.schema)).returns(z.array(Tx.schema)),
};
