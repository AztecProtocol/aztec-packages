import { type ApiSchemaFor } from '@aztec/foundation/schemas';

import { z } from 'zod';

import { EpochProofQuote } from '../prover_coordination/index.js';
import { Tx } from '../tx/tx.js';
import { TxHash } from '../tx/tx_hash.js';

/** Provides basic operations for ProverNodes to interact with other nodes in the network. */
export interface ProverCoordinationApi {
  /**
   * Returns a transaction given its hash if available.
   * @param txHash - The hash of the transaction, used as an ID.
   * @returns The transaction, if found, 'undefined' otherwise.
   */
  getTxByHash(txHash: TxHash): Promise<Tx | undefined>;

  /**
   * Receives a quote for an epoch proof and stores it in its EpochProofQuotePool
   * @param quote - The quote to store
   */
  addEpochProofQuote(quote: EpochProofQuote): Promise<void>;
}

export interface ProverCoordination extends ProverCoordinationApi {
  /** Stops the service. */
  stop(): Promise<void>;
}

export const ProverCoordinationApiSchema: ApiSchemaFor<ProverCoordinationApi> = {
  getTxByHash: z.function().args(TxHash.schema).returns(Tx.schema.optional()),
  addEpochProofQuote: z.function().args(EpochProofQuote.schema).returns(z.void()),
};
