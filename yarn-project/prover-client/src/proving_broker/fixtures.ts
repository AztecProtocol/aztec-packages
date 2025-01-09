import { type ProofUri, type ProvingJobId, ProvingRequestType, makeProvingJobId } from '@aztec/circuit-types';
import { randomBytes } from '@aztec/foundation/crypto';

export function makeRandomProvingJobId(epochNumber?: number): ProvingJobId {
  return makeProvingJobId(epochNumber ?? 1, ProvingRequestType.BASE_PARITY, randomBytes(8).toString('hex'));
}

export function makeInputsUri(): ProofUri {
  return randomBytes(8).toString('hex') as ProofUri;
}

export function makeOutputsUri(): ProofUri {
  return randomBytes(8).toString('hex') as ProofUri;
}
