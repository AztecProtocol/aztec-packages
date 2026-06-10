import { type ContractArtifact, loadContractArtifact } from '@aztec/stdlib/abi';

import { makeStandardContract } from '../make_standard_contract.js';
import type { StandardContract } from '../standard_contract.js';

export {
  STANDARD_PUBLIC_CHECKS_ADDRESS,
  STANDARD_PUBLIC_CHECKS_CLASS_ID,
  STANDARD_PUBLIC_CHECKS_SALT,
} from './constants.js';

let standardContract: StandardContract;
let standardContractArtifact: ContractArtifact;

export async function getPublicChecksArtifact(): Promise<ContractArtifact> {
  if (!standardContractArtifact) {
    const { default: publicChecksJson } = await import('../../artifacts/PublicChecks.json', {
      with: { type: 'json' },
    });
    standardContractArtifact = loadContractArtifact(publicChecksJson);
  }
  return standardContractArtifact;
}

/** Returns the standard deployment of public_checks. */
export async function getStandardPublicChecks(): Promise<StandardContract> {
  if (!standardContract) {
    const artifact = await getPublicChecksArtifact();
    standardContract = makeStandardContract('PublicChecks', artifact);
  }
  return standardContract;
}
