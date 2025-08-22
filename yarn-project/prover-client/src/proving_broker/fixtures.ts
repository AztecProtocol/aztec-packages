import { randomBytes } from '@aztec/foundation/crypto';
import { type ProofUri, type ProvingJobId, makeProvingJobId } from '@aztec/stdlib/interfaces/server';
import { ProvingRequestType } from '@aztec/stdlib/proofs';

export function makeRandomProvingJobId(epochNumber?: number): ProvingJobId {
  return makeProvingJobId(epochNumber ?? 1, ProvingRequestType.PARITY_BASE, randomBytes(8).toString('hex'));
}

export function makeInputsUri(): ProofUri {
  return randomBytes(8).toString('hex') as ProofUri;
}

export function makeOutputsUri(): ProofUri {
  return randomBytes(8).toString('hex') as ProofUri;
}
