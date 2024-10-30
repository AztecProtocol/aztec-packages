/* eslint-disable prefer-rest-params */
import { ApiBrand, type ApiHandlerFor } from '@aztec/foundation/json-rpc/server';
import { parse, schemas } from '@aztec/foundation/schemas';

import { EpochProofQuote } from '../prover_coordination/epoch_proof_quote.js';

export type EpochProvingJobState =
  | 'initialized'
  | 'processing'
  | 'awaiting-prover'
  | 'publishing-proof'
  | 'completed'
  | 'failed';

/** JSON RPC public interface to a prover node. */
export interface ProverNodeApi {
  getJobs(): Promise<{ uuid: string; status: EpochProvingJobState }[]>;

  startProof(epochNumber: number): Promise<void>;

  prove(epochNumber: number): Promise<void>;

  sendEpochProofQuote(quote: EpochProofQuote): Promise<void>;
}

/** Handles input validation for a prover node public interface. */
export class ProverNodeApiHandler implements ApiHandlerFor<ProverNodeApi> {
  __branding = ApiBrand;

  constructor(public readonly implementation: ProverNodeApi) {}

  startProof(): Promise<void> {
    return this.implementation.startProof(...parse(arguments, schemas.Integer));
  }

  prove(): Promise<void> {
    return this.implementation.prove(...parse(arguments, schemas.Integer));
  }

  getJobs(): Promise<{ uuid: string; status: EpochProvingJobState }[]> {
    return this.implementation.getJobs();
  }

  sendEpochProofQuote(): Promise<void> {
    return this.implementation.sendEpochProofQuote(...parse(arguments, EpochProofQuote.schema));
  }
}
