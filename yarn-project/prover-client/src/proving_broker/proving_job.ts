import { ProvingRequestType, type V2ProvingJobId } from '@aztec/circuit-types';
import { randomBytes } from '@aztec/foundation/crypto';

export function makeProvingJobId<T extends ProvingRequestType>(proofType: T): V2ProvingJobId<T> {
  const id = randomBytes(8).toString('hex');
  return `${ProvingRequestType[proofType]}:${id}` as V2ProvingJobId<T>;
}
