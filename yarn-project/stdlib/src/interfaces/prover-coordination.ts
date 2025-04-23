import { z } from 'zod';

import type { ApiSchemaFor } from '../schemas/index.js';
import { Tx } from '../tx/tx.js';
import { TxHash } from '../tx/tx_hash.js';

/** Provides basic operations for ProverNodes to interact with other nodes in the network. */
export interface ProverCoordination {
  /**
   * Returns a set of transactions given their hashes if available.
   * @param txHashes - The hashes of the transactions, used as an ID.
   * @returns The transactions found, no necessarily in the same order as the hashes.
   */
  getTxsByHash(txHashes: TxHash[]): Promise<Tx[]>;

  gatherTxs(txHashes: TxHash[]): Promise<void>;
}

export const ProverCoordinationApiSchema: ApiSchemaFor<ProverCoordination> = {
  getTxsByHash: z.function().args(z.array(TxHash.schema)).returns(z.array(Tx.schema)),
  gatherTxs: z.function().args(z.array(TxHash.schema)).returns(z.void()),
};
