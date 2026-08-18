import { EpochNumber } from '@aztec/foundation/branded-types';
import { randomBytes } from '@aztec/foundation/crypto/random';
import { type ProofUri, type ProvingJobId, makeProvingJobId } from '@aztec/stdlib/interfaces/server';
import { ProvingRequestType } from '@aztec/stdlib/proofs';

export function makeRandomProvingJobId(epochNumber?: EpochNumber): ProvingJobId {
  return makeProvingJobId(
    epochNumber ?? EpochNumber(1),
    ProvingRequestType.INBOX_PARITY,
    randomBytes(8).toString('hex'),
  );
}

export function makeInputsUri(): ProofUri {
  return randomBytes(8).toString('hex') as ProofUri;
}

export function makeOutputsUri(): ProofUri {
  return randomBytes(8).toString('hex') as ProofUri;
}
