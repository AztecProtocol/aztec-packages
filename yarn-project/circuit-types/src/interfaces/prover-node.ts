import { type Signature } from '@aztec/foundation/eth-signature';
import { type ApiSchemaFor, schemas } from '@aztec/foundation/schemas';

import { z } from 'zod';

import { EpochProofQuote } from '../prover_coordination/epoch_proof_quote.js';

// Required by ts to export the schema of EpochProofQuote
export { type Signature };

const EpochProvingJobState = [
  'initialized',
  'processing',
  'awaiting-prover',
  'publishing-proof',
  'completed',
  'failed',
] as const;

export type EpochProvingJobState = (typeof EpochProvingJobState)[number];

/** JSON RPC public interface to a prover node. */
export interface ProverNodeApi {
  getJobs(): Promise<{ uuid: string; status: EpochProvingJobState }[]>;

  startProof(epochNumber: number): Promise<void>;

  prove(epochNumber: number): Promise<void>;

  sendEpochProofQuote(quote: EpochProofQuote): Promise<void>;
}

/** Schemas for prover node API functions. */
export const ProverNodeApiSchema: ApiSchemaFor<ProverNodeApi> = {
  getJobs: z
    .function()
    .args()
    .returns(z.array(z.object({ uuid: z.string(), status: z.enum(EpochProvingJobState) }))),

  startProof: z.function().args(schemas.Integer).returns(z.void()),

  prove: z.function().args(schemas.Integer).returns(z.void()),

  sendEpochProofQuote: z.function().args(EpochProofQuote.schema).returns(z.void()),
};
