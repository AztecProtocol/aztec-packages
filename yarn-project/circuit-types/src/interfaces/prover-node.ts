import { type Signature } from '@aztec/foundation/eth-signature';
import { type ApiSchemaFor, schemas } from '@aztec/foundation/schemas';

import { z } from 'zod';

// Required by ts to export the schema of EpochProofQuote
export { type Signature };

const EpochProvingJobState = [
  'initialized',
  'processing',
  'awaiting-prover',
  'publishing-proof',
  'completed',
  'failed',
  'stopped',
  'timed-out',
] as const;

export type EpochProvingJobState = (typeof EpochProvingJobState)[number];

export const EpochProvingJobTerminalState: EpochProvingJobState[] = [
  'completed',
  'failed',
  'stopped',
  'timed-out',
] as const;

export type EpochProvingJobTerminalState = (typeof EpochProvingJobTerminalState)[number];

/** JSON RPC public interface to a prover node. */
export interface ProverNodeApi {
  getJobs(): Promise<{ uuid: string; status: EpochProvingJobState; epochNumber: number }[]>;

  startProof(epochNumber: number): Promise<void>;

  prove(epochNumber: number): Promise<void>;
}

/** Schemas for prover node API functions. */
export const ProverNodeApiSchema: ApiSchemaFor<ProverNodeApi> = {
  getJobs: z
    .function()
    .args()
    .returns(z.array(z.object({ uuid: z.string(), status: z.enum(EpochProvingJobState), epochNumber: z.number() }))),

  startProof: z.function().args(schemas.Integer).returns(z.void()),

  prove: z.function().args(schemas.Integer).returns(z.void()),
};
