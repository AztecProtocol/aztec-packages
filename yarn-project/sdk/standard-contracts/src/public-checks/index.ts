import { loadContractArtifact } from '@aztec/stdlib/abi';
import type { NoirCompiledContract } from '@aztec/stdlib/noir';

import PublicChecksJson from '../../artifacts/PublicChecks.json' with { type: 'json' };
import { makeStandardContract } from '../make_standard_contract.js';
import type { StandardContract } from '../standard_contract.js';

export {
  STANDARD_PUBLIC_CHECKS_ADDRESS,
  STANDARD_PUBLIC_CHECKS_CLASS_ID,
  STANDARD_PUBLIC_CHECKS_SALT,
} from './constants.js';

export const PublicChecksArtifact = loadContractArtifact(PublicChecksJson as NoirCompiledContract);

let standardContract: StandardContract;

/** Returns the standard deployment of public_checks. */
export function getStandardPublicChecks(): Promise<StandardContract> {
  if (!standardContract) {
    standardContract = makeStandardContract('PublicChecks', PublicChecksArtifact);
  }
  return Promise.resolve(standardContract);
}
